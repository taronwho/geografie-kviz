// Dobývání v prohlížeči (pravidla a vykreslení jsou v conquest.js): karta na záložce Více hráčů, rozcestník (Moje hry, Lobby,
// Založit hru), detail otevřené hry (Chci hrát, Odejít, Pozvat, Barva a znak), obrazovka hry s mapou (posun a přiblížení prsty,
// kolečkem i dvojitým klepnutím), spodní list území, otázka tahu a animace výsledku (šipka útoku, rozlití inkoustu z místa útoku,
// zapíchnutí vlaječky, pobourání a stavba opevnění, poklad, zlatý obrys celého regionu, zlomená šipka), kronika tažení, přehrání
// hry a stupně vítězů s odměnou. Při omezeném pohybu (prefers-reduced-motion) jsou čekání krátká a CSS animace vypnuté.
// app.js předá pomocné funkce (createUI) a napojí obrazovku 'conquest', tlačítko Zpět, akce karty a odkaz …?dobyvani=KÓD.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantConquestUI = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const STORE = 'mudrlant.conquest';
    const LINK_PARAM = 'dobyvani';
    const PENDING_KEY = 'mudrlant.pendingConquest';
    const MAX_ZOOM = 8;
    const POLL_GAME = 20000;
    const POLL_LOBBY = 7000;
    const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
    const parseCode = (text) => {
        const raw = String(text || '');
        const fromLink = raw.match(/[?&#]dobyvani=([A-Za-z0-9-]+)/);
        const code = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[\s-]/g, '');
        return CODE_PATTERN.test(code) ? code : '';
    };

    // deps: Conquest (conquest.js), Social, appContent, signedUser, login, enter (obrazovka 'conquest'), isActive, renderHome, renderIcons,
    // showDialog, closeDialog, showToast, loadMap(id), loadTopics(), award({ xp, badge, place }), share(payload), sound(name), touchTip, onCard()
    const createUI = (deps) => {
        const C = deps.Conquest;
        const Social = deps.Social;
        const app = deps.appContent;
        const doc = root.document;
        const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
        const storage = () => { try { return root.localStorage; } catch (error) { return null; } };
        const readPrefs = () => { try { const s = storage(); return JSON.parse((s && s.getItem(STORE)) || '{}') || {}; } catch (error) { return {}; } };
        const writePrefs = (patch) => { try { const s = storage(); if (s) s.setItem(STORE, JSON.stringify({ ...readPrefs(), ...patch })); } catch (error) { /* bez úložiště se volba nepamatuje */ } };
        const reduced = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (error) { return false; } };
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, reduced() ? Math.min(ms, 80) : ms));
        const active = () => deps.isActive();
        const errorText = (error, fallback) => (error && error.message ? error.message : fallback);
        const sound = (name) => { try { if (deps.sound) deps.sound(name); } catch (error) { /* bez zvuku */ } };

        // --- Mapy (data/dobyvani-<mapa>.json, načtou se, až jsou potřeba) ---
        const maps = {};
        const mapLoads = {};
        const ensureMap = (id) => {
            if (maps[id]) return Promise.resolve(maps[id]);
            if (!C.MAP_BY_ID[id]) return Promise.reject(new Error('Neznámá mapa'));
            if (!mapLoads[id]) mapLoads[id] = deps.loadMap(id).then(data => { maps[id] = data; return data; }).catch(error => { delete mapLoads[id]; throw error; });
            return mapLoads[id];
        };
        let topicsLoad = null;
        const topics = () => {
            if (!topicsLoad) topicsLoad = deps.loadTopics().catch(error => { topicsLoad = null; throw error; });
            return topicsLoad;
        };

        // --- Lobby a moje hry ---
        let lobby = null;
        let lobbyAt = 0;
        let lobbyLoading = null;
        let lobbyError = '';
        let missing = false;
        const loadLobby = () => {
            if (lobbyLoading) return lobbyLoading;
            lobbyLoading = (async () => {
                try {
                    const data = await Social.conquestLobby();
                    lobby = data;
                    lobbyAt = Date.now();
                    lobbyError = '';
                    await Promise.all([...new Set([...data.mine, ...data.open].map(game => game.map))].map(id => ensureMap(id).catch(() => null)));
                    data.mine.filter(game => game.status === 'finished' && !game.claimed).forEach(game => claim(game.id));
                } catch (error) {
                    if (error && error.status === 404) missing = true;
                    lobbyError = errorText(error, 'Hry se nepodařilo načíst.');
                } finally { lobbyLoading = null; }
                return lobby;
            })();
            return lobbyLoading;
        };
        const findGame = (id) => (lobby ? [...lobby.mine, ...lobby.open].find(game => game.id === id) : null) || null;
        const upsertMine = (game) => {
            if (!game || !lobby) return;
            const known = lobby.mine.find(item => item.id === game.id);
            lobby.mine = known ? lobby.mine.map(item => (item.id === game.id ? { ...item, ...game } : item)) : [game, ...lobby.mine];
            lobby.open = lobby.open.filter(item => item.id !== game.id);
        };

        // Karta na záložce Více hráčů
        const cardHtml = () => (deps.signedUser() && !missing ? C.homeCardHtml({ games: lobby ? lobby.mine : null, maps, loading: Boolean(lobbyLoading) }) : '');
        const paintCard = () => {
            const card = doc.getElementById('conquest-card');
            if (!card) return;
            const html = cardHtml();
            if (!html) { card.remove(); return; }
            card.outerHTML = html;
            const fresh = doc.getElementById('conquest-card');
            if (fresh) deps.renderIcons(fresh);
        };
        const refresh = async (force = false) => {
            if (!deps.signedUser() || missing) return;
            if (!force && lobby && Date.now() - lobbyAt < 60000) { paintCard(); return; }
            await loadLobby();
            paintCard();
            if (active() && ui.kind !== 'game') renderHub();
        };
        const reset = () => { lobby = null; lobbyAt = 0; missing = false; game = null; ui.kind = 'hub'; ui.tab = 'mine'; };

        // --- Rozcestník ---
        const prefs = readPrefs();
        const ui = { kind: 'hub', tab: 'mine', gameId: null, busy: false, error: '', confirmLeave: false };
        const draft = {
            map: 'evropa', hours: 72, players: 4, actions: 5, period: 'day', visibility: 'public',
            ...(prefs.draft || {}),
            color: C.COLOR_BY_ID[prefs.color] ? prefs.color : 'cervena', emblem: C.EMBLEM_BY_ID[prefs.emblem] ? prefs.emblem : 'lev'
        };
        if (!C.MAP_BY_ID[draft.map]) draft.map = 'evropa';
        if (!C.DURATIONS.includes(Number(draft.hours))) draft.hours = 72;
        const saveDraft = () => writePrefs({ draft: { map: draft.map, hours: draft.hours, players: draft.players, actions: draft.actions, period: draft.period, visibility: draft.visibility } });

        const renderHub = () => {
            if (!active() || ui.kind === 'game') return;
            const now = Date.now();
            let body;
            if (ui.kind === 'lobby') {
                const found = findGame(ui.gameId);
                body = found ? C.lobbyDetailHtml({ game: found, maps, busy: ui.confirmLeave ? 'leave' : ui.busy, error: ui.error }) : C.mineHtml({ games: lobby ? lobby.mine : null, maps, now, error: lobbyError });
            } else if (ui.tab === 'lobby') body = C.lobbyHtml({ games: lobby ? lobby.open : null, maps, now, error: lobbyError });
            else if (ui.tab === 'create') body = C.createHtml({ draft, maps, busy: ui.busy, error: ui.error });
            else body = C.mineHtml({ games: lobby ? lobby.mine : null, maps, now, error: lobbyError });
            const keep = app.scrollTop;
            app.innerHTML = C.hubHtml({ tab: ui.kind === 'lobby' ? 'mine' : ui.tab, body });
            deps.renderIcons(app);
            app.scrollTop = keep;
            if (ui.tab === 'create' && ui.kind === 'hub' && !maps[draft.map]) ensureMap(draft.map).then(() => renderHub()).catch(() => {});
        };
        const openHub = async (tab = null) => {
            if (!deps.signedUser()) { deps.login(); return; }
            if (deps.touchTip) deps.touchTip('conquest');
            stopGame();
            ui.kind = 'hub';
            if (tab) ui.tab = tab;
            ui.error = '';
            deps.enter();
            app.scrollTop = 0;
            renderHub();
            await loadLobby();
            renderHub();
            paintCard();
            schedule();
        };
        const openLobby = (id) => {
            ui.kind = 'lobby';
            ui.gameId = id;
            ui.error = '';
            ui.confirmLeave = false;
            if (!active()) deps.enter();
            renderHub();
            schedule();
        };

        // Barva a znak (okno): obsazené barvy hry nejdou; onDone({ color, emblem })
        const pickLook = ({ taken = [], title = 'Barva a znak', onDone }) => {
            const free = C.COLORS.find(color => !taken.includes(color.id));
            const state = { color: taken.includes(draft.color) ? (free ? free.id : draft.color) : draft.color, emblem: draft.emblem, tab: 'color', error: '' };
            const render = () => deps.showDialog(title, C.lookHtml({ ...state, taken }), {
                onClick: (event) => {
                    const tab = event.target.closest('[data-cq-look-tab]');
                    if (tab) { state.tab = tab.dataset.cqLookTab === 'emblem' ? 'emblem' : 'color'; render(); return; }
                    const color = event.target.closest('[data-cq-color]');
                    if (color && !color.disabled) { state.color = color.dataset.cqColor; render(); return; }
                    const emblem = event.target.closest('[data-cq-emblem]');
                    if (emblem) { state.emblem = emblem.dataset.cqEmblem; render(); return; }
                    if (event.target.closest('[data-cq="look-done"]')) {
                        draft.color = state.color;
                        draft.emblem = state.emblem;
                        writePrefs({ color: state.color, emblem: state.emblem });
                        deps.closeDialog();
                        onDone({ color: state.color, emblem: state.emblem });
                    }
                }
            });
            render();
        };
        const takenColors = (found, meId) => (found ? found.players.filter(player => !player.me && player.id !== meId).map(player => player.flag_color) : []);

        // Přidání: veřejná hra podle id, soukromá kódem
        const joinGame = ({ id = null, code = '' }) => {
            const found = id ? findGame(id) : null;
            pickLook({
                taken: takenColors(found), title: 'Tvoje barva a znak',
                onDone: async ({ color, emblem }) => {
                    try {
                        const joined = await Social.conquestJoin({ game: id, code, color, emblem });
                        upsertMine(joined);
                        if (!lobby) await loadLobby();
                        await ensureMap(joined.map).catch(() => null);
                        deps.showToast(joined.status === 'running' ? 'Hra je plná a právě začala!' : 'Jsi ve hře. Počkej na ostatní, nebo dej Chci hrát.');
                        if (joined.status === 'running') openGame(joined.id); else openLobby(joined.id);
                        paintCard();
                    } catch (error) {
                        deps.showToast(errorText(error, 'Přidat se do hry se nepodařilo.'));
                        loadLobby().then(() => renderHub());
                    }
                }
            });
        };
        const openCode = (initial = '') => {
            if (!deps.signedUser()) {
                const saved = parseCode(initial);
                if (saved) { try { const s = storage(); if (s) s.setItem(PENDING_KEY, saved); } catch (error) { /* kód se nezapamatuje */ } }
                deps.showDialog('Dobývání', `<p class="mb-4 text-sm text-slate-600 dark:text-slate-300">Někdo tě zve do hry Dobývání. Přihlas se a hned potom se přidáš.</p>
                    <button type="button" data-cq-login class="flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl btn-3d bg-brand-700 px-3 text-base font-black text-white"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>`,
                { onClick: (event) => { if (event.target.closest('[data-cq-login]')) deps.login(); } });
                return;
            }
            const state = { code: parseCode(initial) || '', error: '' };
            const render = () => deps.showDialog('Mám kód hry', `<form data-cq-code-form class="flex flex-col gap-3" autocomplete="off">
                    <input id="conquest-code" data-autofocus type="text" inputmode="text" autocapitalize="characters" maxlength="200" placeholder="Např. K7M2QX" value="${esc(state.code)}" aria-label="Kód hry" class="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-center font-mono text-xl font-black uppercase tracking-widest text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                    <button type="submit" class="flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl btn-3d bg-brand-700 px-3 text-base font-black text-white"><i data-lucide="user-plus" class="h-5 w-5"></i> Přidat se</button>
                    ${state.error ? `<p class="text-sm font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(state.error)}</p>` : ''}</form>`, {
                onSubmit: () => {
                    const input = doc.getElementById('conquest-code');
                    const code = parseCode(input ? input.value : state.code);
                    if (!code) { state.code = input ? input.value : ''; state.error = 'Kód hry má 6 znaků, třeba K7M2QX. Můžeš vložit i celý odkaz.'; render(); return; }
                    deps.closeDialog();
                    if (!active()) { deps.enter(); renderHub(); }
                    joinGame({ code });
                }
            });
            render();
        };
        const afterLogin = () => {
            let code = '';
            try { const s = storage(); code = s ? parseCode(s.getItem(PENDING_KEY)) : ''; if (s) s.removeItem(PENDING_KEY); } catch (error) { code = ''; }
            if (code) openCode(code);
        };
        // Odkaz …?dobyvani=KÓD: kód se z adresy hned odstraní
        const takeLink = () => {
            const place = root.location;
            if (!place) return '';
            const params = new URLSearchParams(place.search);
            if (!params.has(LINK_PARAM)) return '';
            const code = parseCode(params.get(LINK_PARAM));
            params.delete(LINK_PARAM);
            const query = params.toString();
            try { root.history.replaceState(root.history.state, '', place.pathname + (query ? `?${query}` : '') + place.hash); } catch (error) { /* adresa zůstane */ }
            return code;
        };
        const shareGame = (found) => {
            if (!found || !found.code || !deps.share) return;
            const place = root.location;
            const url = `${place ? `${place.origin}${place.pathname}` : ''}?${LINK_PARAM}=${found.code}`;
            deps.share({ title: 'Dobývání v Mudrlantovi', text: `Pojď si zahrát Dobývání (${C.mapTitle(found.map)}, ${C.durationLabel(found.hours)}).\nKód hry: ${found.code}`, url });
        };

        const createGame = async () => {
            if (ui.busy) return;
            ui.busy = true;
            ui.error = '';
            renderHub();
            try {
                const data = await ensureMap(draft.map).catch(() => null);
                const players = Math.min(draft.players, data ? data.maxPlayers : C.MAX_PLAYERS);
                const created = await Social.conquestCreate({ map: draft.map, players, hours: draft.hours, period: draft.period, actions: draft.actions, visibility: draft.visibility, color: draft.color, emblem: draft.emblem });
                ui.busy = false;
                if (!lobby) await loadLobby();
                upsertMine(created);
                deps.showToast(draft.visibility === 'private' ? 'Hra je založená. Pošli ostatním kód.' : 'Hra je založená a čeká v Lobby na hráče.');
                openLobby(created.id);
                paintCard();
            } catch (error) {
                ui.busy = false;
                ui.error = errorText(error, 'Hru se nepodařilo založit.');
                renderHub();
            }
        };
        const toggleReady = async () => {
            const found = findGame(ui.gameId);
            const me = found && found.players.find(player => player.me);
            if (!me || ui.busy) return;
            ui.busy = true;
            renderHub();
            try {
                const updated = await Social.conquestReady(found.id, !me.ready);
                ui.busy = false;
                upsertMine(updated);
                if (updated.status === 'running') { deps.showToast('Všichni chtějí hrát. Hra začíná!'); openGame(updated.id); return; }
                renderHub();
            } catch (error) {
                ui.busy = false;
                ui.error = errorText(error, 'Nepodařilo se.');
                renderHub();
            }
        };
        const leaveLobby = async () => {
            const found = findGame(ui.gameId);
            if (!found) return;
            if (!ui.confirmLeave) { ui.confirmLeave = true; renderHub(); return; }
            ui.confirmLeave = false;
            try {
                await Social.conquestLeave(found.id);
                lobby.mine = lobby.mine.filter(item => item.id !== found.id);
                deps.showToast('Už nejsi ve hře. Místo je volné pro další hráče.');
                ui.kind = 'hub';
                ui.tab = 'mine';
                renderHub();
                loadLobby().then(() => { renderHub(); paintCard(); });
            } catch (error) {
                ui.error = errorText(error, 'Odejít se nepodařilo.');
                renderHub();
            }
        };
        const changeLook = () => {
            const found = findGame(ui.gameId);
            if (!found) return;
            pickLook({
                taken: takenColors(found),
                onDone: async ({ color, emblem }) => {
                    try { upsertMine(await Social.conquestSetLook(found.id, color, emblem)); } catch (error) { ui.error = errorText(error, 'Barvu a znak se nepodařilo uložit.'); }
                    renderHub();
                }
            });
        };

        // --- Hra ---
        let game = null; // { id, state, data, view, vb, selected, source, move, rewards }
        const rewards = new Map();
        const claiming = new Set();
        const claim = async (id) => {
            if (claiming.has(id)) return;
            claiming.add(id);
            try {
                const result = await Social.conquestClaim(id);
                if (result.claimed_now) {
                    const reward = C.rewardFor(result);
                    rewards.set(id, reward);
                    if (reward.xp || reward.badge) deps.award({ ...reward, place: result.place });
                    if (game && game.id === id && game.view.finished) showResult();
                }
            } catch (error) { claiming.delete(id); }
        };
        const viewFor = (state, data) => C.viewOf(state, data, (deps.signedUser() || {}).id);
        const openGame = async (id) => {
            if (!deps.signedUser()) { deps.login(); return; }
            stopGame();
            ui.kind = 'game';
            ui.gameId = id;
            deps.enter();
            app.innerHTML = `<div class="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center"><img src="icons/topics/${esc(C.ART.card)}.webp" alt="" class="bob h-20 w-20 object-contain"><p class="text-sm font-bold text-slate-600 dark:text-slate-300">Rozbaluji mapu…</p></div>`;
            try {
                const state = await Social.conquestState(id);
                const data = await ensureMap(state.map);
                if (!active() || ui.kind !== 'game' || ui.gameId !== id) return;
                if (state.status === 'lobby') { upsertMine(state); openLobby(id); return; }
                game = { id, state, data, view: viewFor(state, data), vb: null, selected: null, source: null, move: null };
                renderGame();
                topics().catch(() => null);
                if (game.view.finished) { if (!state.claimed) claim(id); showResult(); }
                schedule();
            } catch (error) {
                deps.showToast(errorText(error, 'Hru se nepodařilo načíst.'));
                if (active()) openHub('mine');
            }
        };
        const stopGame = () => { if (game && game.move) clearFx(); game = null; };

        // Vykreslení obrazovky hry (přiblížení zůstane)
        const renderGame = () => {
            if (!game || !active()) return;
            app.innerHTML = C.gameScreenHtml(game.view);
            app.scrollTop = 0;
            deps.renderIcons(app);
            const wrap = app.querySelector('[data-cq-wrap]');
            if (wrap) wrap.style.aspectRatio = `${game.data.w} / ${game.data.h}`;
            mountMap();
            if (game.selected) showSheet(game.selected);
        };
        // Jen mapa a čísla (po tahu, při obnovení), bez přestavby celé obrazovky
        const repaintMap = () => {
            const holder = app.querySelector('[data-cq-map]');
            if (!holder || !game) { renderGame(); return; }
            holder.innerHTML = C.mapSvg(game.data, game.view);
            const players = app.querySelector('[data-cq-players]');
            if (players) players.innerHTML = C.playersStripHtml(game.view);
            const recent = app.querySelector('[data-cq-recent]');
            if (recent) recent.innerHTML = C.recentHtml(game.view);
            const budget = app.querySelector('[data-cq-budget]');
            if (budget && game.view.budget) budget.innerHTML = `<i data-lucide="swords" class="h-4 w-4 text-brand-700 dark:text-gold-300"></i><span class="sr-only">Tahy </span>${game.view.budget.left}/${game.view.budget.total}`;
            deps.renderIcons(app.querySelector('[data-cq-panel]') || app);
            if (budget) deps.renderIcons(budget);
            mountMap();
            highlight();
        };
        const setState = (state) => {
            game.state = state;
            game.view = viewFor(state, game.data);
            const me = state.players.find(player => player.me);
            if (lobby && me) upsertMine({ ...state, budget: state.budget, owners: Object.fromEntries((state.territories || []).filter(row => row.o).map(row => [row.t, (state.players.find(p => p.id === row.o) || {}).seat])) });
        };

        // --- Mapa: posun, přiblížení, klepnutí ---
        let svg = null;
        let gesture = null;
        let lastTap = null;
        const mountMap = () => {
            svg = app.querySelector('[data-cq-map] svg');
            if (!svg || !game) return;
            if (!game.vb) game.vb = { x: 0, y: 0, w: game.data.w, h: game.data.h };
            applyView();
            const holder = svg.parentElement;
            if (holder.dataset.bound) return;
            holder.dataset.bound = '1';
            holder.addEventListener('pointerdown', onPointerDown);
            holder.addEventListener('pointermove', onPointerMove);
            holder.addEventListener('pointerup', onPointerUp);
            holder.addEventListener('pointercancel', onPointerUp);
            holder.addEventListener('wheel', onWheel, { passive: false });
        };
        const zoomOf = () => (game ? game.data.w / game.vb.w : 1);
        const clampView = () => {
            const { w, h } = game.data;
            const vb = game.vb;
            vb.w = Math.min(w, Math.max(w / MAX_ZOOM, vb.w));
            vb.h = vb.w * h / w;
            vb.x = Math.min(w - vb.w * 0.5, Math.max(-vb.w * 0.5, vb.x));
            vb.y = Math.min(h - vb.h * 0.5, Math.max(-vb.h * 0.5, vb.y));
            if (vb.w >= w - 0.5) { vb.x = 0; vb.y = 0; }
        };
        const applyView = () => {
            if (!svg || !game) return;
            clampView();
            const vb = game.vb;
            svg.setAttribute('viewBox', `${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}`);
            const reset = app.querySelector('[data-cq="zoom-reset"]');
            if (reset) { reset.classList.toggle('hidden', zoomOf() < 1.05); reset.classList.toggle('flex', zoomOf() >= 1.05); }
            updateDetail();
        };
        const unitsPerPixel = () => { const ctm = svg && svg.getScreenCTM ? svg.getScreenCTM() : null; return ctm && ctm.a ? 1 / ctm.a : 1; };
        const toSvg = (clientX, clientY) => {
            const ctm = svg.getScreenCTM();
            if (!ctm) return { x: 0, y: 0 };
            const inverse = ctm.inverse();
            return { x: inverse.a * clientX + inverse.c * clientY + inverse.e, y: inverse.b * clientX + inverse.d * clientY + inverse.f };
        };
        // Vlaječky a ikony mají na displeji skoro stálou velikost, popisky se ukážou, až se vejdou
        const updateDetail = () => {
            if (!svg || !game) return;
            const upp = unitsPerPixel();
            const zoom = zoomOf();
            const markScale = (13 * Math.pow(zoom, 0.35) * upp) / 16.5;
            svg.querySelectorAll('.cq-mark-scale').forEach(element => element.setAttribute('transform', `scale(${markScale.toFixed(3)})`));
            svg.querySelectorAll('.cq-label').forEach(element => {
                const base = Number(element.dataset.size) || 10;
                const px = base / upp;
                const hide = px < 7.5;
                element.classList.toggle('cq-hide', hide);
                if (hide) return;
                const size = Math.min(base, 15 * upp);
                const item = game.view.index.byId.get(element.dataset.label);
                element.setAttribute('font-size', size.toFixed(2));
                if (item) element.setAttribute('y', (item.a[1] + size * 1.2).toFixed(2));
            });
        };
        const zoomAt = (point, factor) => {
            const vb = game.vb;
            const w = Math.min(game.data.w, Math.max(game.data.w / MAX_ZOOM, vb.w / factor));
            const real = vb.w / w;
            vb.x = point.x - (point.x - vb.x) / real;
            vb.y = point.y - (point.y - vb.y) / real;
            vb.w = w;
            applyView();
        };
        const onWheel = (event) => {
            if (!game || !svg) return;
            event.preventDefault();
            zoomAt(toSvg(event.clientX, event.clientY), Math.exp(-event.deltaY * 0.0015));
        };
        const onPointerDown = (event) => {
            if (!game || !svg) return;
            if (!gesture) gesture = { pointers: new Map(), moved: 0, start: event.timeStamp, multi: false };
            gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY });
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch (error) { /* bez zachycení */ }
            gesture.vb0 = { ...game.vb };
            gesture.upp = unitsPerPixel();
            if (gesture.pointers.size === 2) {
                gesture.multi = true;
                const [a, b] = [...gesture.pointers.values()];
                gesture.dist0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                gesture.mid0 = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
            } else gesture.origin = { x: event.clientX, y: event.clientY };
        };
        const onPointerMove = (event) => {
            if (!gesture || !gesture.pointers.has(event.pointerId) || !game) return;
            const pointer = gesture.pointers.get(event.pointerId);
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            gesture.moved = Math.max(gesture.moved, Math.hypot(pointer.x - pointer.x0, pointer.y - pointer.y0));
            if (gesture.pointers.size >= 2) {
                const [a, b] = [...gesture.pointers.values()];
                const factor = Math.hypot(a.x - b.x, a.y - b.y) / gesture.dist0;
                game.vb = { ...gesture.vb0, w: gesture.vb0.w / factor };
                applyView();
                const mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
                game.vb.x += gesture.mid0.x - mid.x;
                game.vb.y += gesture.mid0.y - mid.y;
                applyView();
            } else if (!gesture.multi && gesture.moved > 6 && zoomOf() > 1.02) {
                game.vb = { ...gesture.vb0, x: gesture.vb0.x - (pointer.x - gesture.origin.x) * gesture.upp, y: gesture.vb0.y - (pointer.y - gesture.origin.y) * gesture.upp };
                applyView();
            }
        };
        const onPointerUp = (event) => {
            if (!gesture || !game) return;
            const pointer = gesture.pointers.get(event.pointerId);
            gesture.pointers.delete(event.pointerId);
            if (gesture.pointers.size) { gesture.vb0 = { ...game.vb }; const rest = [...gesture.pointers.values()][0]; gesture.origin = { x: rest.x, y: rest.y }; rest.x0 = rest.x; rest.y0 = rest.y; return; }
            const tap = !gesture.multi && gesture.moved < 8 && event.timeStamp - gesture.start < 600 && event.type === 'pointerup';
            gesture = null;
            if (!tap || !pointer) return;
            const now = event.timeStamp;
            if (lastTap && now - lastTap.at < 330 && Math.hypot(lastTap.x - pointer.x, lastTap.y - pointer.y) < 30) {
                lastTap = null;
                // Dvojité klepnutí: přiblížit, z největšího přiblížení zpět na celou mapu
                if (zoomOf() >= MAX_ZOOM * 0.8) { game.vb = { x: 0, y: 0, w: game.data.w, h: game.data.h }; applyView(); } else zoomAt(toSvg(pointer.x, pointer.y), 2.4);
                return;
            }
            lastTap = { at: now, x: pointer.x, y: pointer.y };
            const hit = doc.elementFromPoint(pointer.x, pointer.y);
            const territory = hit && hit.closest ? hit.closest('[data-t]') : null;
            if (territory && !(game.move && game.move.phase !== 'idle')) selectTerritory(territory.dataset.t);
        };

        // --- Výběr území a spodní list ---
        const highlight = () => {
            const layer = svg && svg.querySelector('.cq-select');
            if (!layer || !game) return;
            const item = game.selected ? game.view.index.byId.get(game.selected) : null;
            layer.innerHTML = item ? `<path d="${item.d}"/>` : '';
        };
        const sheet = () => app.querySelector('[data-cq-sheet]');
        const selectTerritory = (id) => {
            if (!game) return;
            game.selected = id;
            game.source = null;
            highlight();
            showSheet(id);
        };
        const showSheet = (id) => {
            const holder = sheet();
            if (!holder || !game) return;
            holder.innerHTML = C.sheetHtml(game.view, id, { source: game.source });
            deps.renderIcons(holder);
        };
        const closeSheet = () => {
            const holder = sheet();
            if (holder) holder.innerHTML = '';
            if (game) { game.selected = null; game.source = null; }
            highlight();
        };

        // --- Efekty na mapě (vrstva .cq-fx nad mapou) ---
        const fx = () => svg && svg.querySelector('.cq-fx');
        const defsOf = () => svg && svg.querySelector('defs');
        const clearFx = () => {
            const layer = fx();
            if (layer) layer.innerHTML = '';
            if (svg) svg.querySelectorAll('[data-cq-temp]').forEach(element => element.remove());
        };
        const curve = (from, to) => {
            const [ax, ay] = from, [bx, by] = to;
            const dx = bx - ax, dy = by - ay;
            const control = [(ax + bx) / 2 - dy * 0.22, (ay + by) / 2 + dx * 0.22];
            return { a: from, c: control, b: to, d: `M${ax.toFixed(1)} ${ay.toFixed(1)}Q${control[0].toFixed(1)} ${control[1].toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}` };
        };
        const pointOn = (q, t) => [0, 1].map(i => (1 - t) * (1 - t) * q.a[i] + 2 * (1 - t) * t * q.c[i] + t * t * q.b[i]);
        // Místo dopadu: první bod šipky uvnitř cílového území
        const impactPoint = (q, target) => {
            const hit = svg.querySelector(`.cq-hit[data-t="${target}"]`);
            if (hit && hit.isPointInFill && root.DOMPoint) {
                for (let t = 0.3; t <= 1; t += 0.035) {
                    const [x, y] = pointOn(q, t);
                    try { if (hit.isPointInFill(new root.DOMPoint(x, y))) return [x, y]; } catch (error) { break; }
                }
            }
            return q.b;
        };
        const arrowHead = (q, size) => {
            const [bx, by] = q.b;
            const angle = Math.atan2(by - q.c[1], bx - q.c[0]);
            const point = (a, r) => [bx + Math.cos(a) * r, by + Math.sin(a) * r];
            const [lx, ly] = point(angle + Math.PI * 0.82, size), [rx, ry] = point(angle - Math.PI * 0.82, size);
            return `M${bx.toFixed(1)} ${by.toFixed(1)}L${lx.toFixed(1)} ${ly.toFixed(1)}L${rx.toFixed(1)} ${ry.toFixed(1)}Z`;
        };
        // Tah začíná: mapa ztmavne, cíl (a zdroj) se rozsvítí, u útoku se nakreslí čárkovaná šipka
        const showMoveFx = (move) => {
            const layer = fx();
            if (!layer) return;
            const { w, h } = game.data;
            const target = game.view.index.byId.get(move.target);
            const source = move.source ? game.view.index.byId.get(move.source) : null;
            let html = `<rect class="cq-dimmer cq-dimmer-in" x="${-w}" y="${-h}" width="${w * 3}" height="${h * 3}"/>`;
            if (source) html += `<path class="cq-focus-line" d="${source.d}"/>`;
            html += `<path class="cq-focus-line" d="${target.d}"/>`;
            if (source) {
                const q = curve(source.a, target.a);
                move.curve = q;
                const head = 16 / Math.sqrt(zoomOf());
                const defs = defsOf();
                if (defs) defs.insertAdjacentHTML('beforeend', `<mask id="cq-arrow-mask" data-cq-temp maskUnits="userSpaceOnUse" x="${-w}" y="${-h}" width="${w * 3}" height="${h * 3}"><path class="cq-arrow-draw" d="${q.d}" fill="none" stroke="#fff" stroke-width="${(head * 2).toFixed(1)}" pathLength="100" stroke-dasharray="100 100"/></mask>`);
                html += `<g data-cq-arrow mask="url(#cq-arrow-mask)"><path class="cq-arrow" d="${q.d}"/><path class="cq-arrow-head" d="${arrowHead(q, head)}"/></g>`;
            }
            layer.innerHTML = html;
        };
        const burstAt = ([x, y]) => {
            const layer = fx();
            if (!layer) return;
            const r = 22 / Math.sqrt(zoomOf());
            const rays = Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path class="cq-burst-ray" d="M${(Math.cos(a) * r * 0.5).toFixed(1)} ${(Math.sin(a) * r * 0.5).toFixed(1)}L${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}"/>`; }).join('');
            layer.insertAdjacentHTML('beforeend', `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="cq-burst cq-burst-ring" r="${r.toFixed(1)}"/><g class="cq-burst-rays">${rays}</g></g>`);
        };
        // Barva nového majitele se rozlije z místa dopadu (maska s rostoucím kruhem)
        const inkSpread = (id, [x, y], player) => {
            const layer = fx();
            const defs = defsOf();
            if (!layer || !defs) return;
            const item = game.view.index.byId.get(id);
            const [x0, y0, x1, y1] = item.b;
            const r = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([cx, cy]) => Math.hypot(cx - x, cy - y))) + 4;
            defs.insertAdjacentHTML('beforeend', `<mask id="cq-ink-mask" data-cq-temp maskUnits="userSpaceOnUse" x="${x0 - 10}" y="${y0 - 10}" width="${x1 - x0 + 20}" height="${y1 - y0 + 20}"><circle class="cq-ink-grow" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff"/></mask>`);
            if (!defs.querySelector(`#cq-hatch-${player.seat}`)) defs.insertAdjacentHTML('beforeend', C.hatchPattern(player.seat, player.flag_color));
            layer.insertAdjacentHTML('beforeend', `<g mask="url(#cq-ink-mask)"><path d="${item.d}" fill="${player.color.hex}" fill-opacity="0.7"/><path d="${item.d}" fill="url(#cq-hatch-${player.seat})"/><path d="${item.d}" fill="none" stroke="${C.inkOf(player.flag_color)}" stroke-width="2.4" vector-effect="non-scaling-stroke"/></g>`);
        };
        const breakArrow = (move) => {
            const layer = fx();
            const arrow = layer && layer.querySelector('[data-cq-arrow]');
            if (!arrow || !move.curve) return;
            const q = move.curve;
            // Šipka se zlomí v polovině: dvě poloviny křivky (de Casteljau) odpadnou
            const m = pointOn(q, 0.5);
            const c1 = [(q.a[0] + q.c[0]) / 2, (q.a[1] + q.c[1]) / 2], c2 = [(q.c[0] + q.b[0]) / 2, (q.c[1] + q.b[1]) / 2];
            const part = (a, c, b) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
            arrow.outerHTML = `<g><path class="cq-arrow cq-arrow-break-a" d="${part(q.a, c1, m)}"/><g class="cq-arrow-break-b"><path class="cq-arrow" d="${part(m, c2, q.b)}"/><path class="cq-arrow-head" d="${arrowHead(q, 16 / Math.sqrt(zoomOf()))}"/></g></g>`;
        };
        const shakeTerritory = (id) => {
            const layer = fx();
            const item = game.view.index.byId.get(id);
            if (layer && item) layer.insertAdjacentHTML('beforeend', `<path class="cq-focus-line cq-shake" d="${item.d}" stroke="#b42318"/>`);
            const mark = svg && svg.querySelector(`[data-mark="${id}"]`);
            if (mark) mark.classList.add('cq-shake');
        };
        const crumbleIcon = (id) => {
            const icon = svg && svg.querySelector(`[data-mark="${id}"] .cq-icon:not(.cq-treasure)`);
            if (!icon) return;
            icon.insertAdjacentHTML('beforeend', '<path class="cq-crack cq-crack-in" d="M12 3L10 9L14 13L11 19M14 13L18 15"/>');
            icon.classList.add('cq-crumble');
        };
        const openChest = (id) => {
            const chest = svg && svg.querySelector(`[data-mark="${id}"] .cq-treasure`);
            if (!chest) return;
            chest.insertAdjacentHTML('beforeend', `<g class="cq-lid-open">${C.iconMarkup('treasure').match(/<path d="M3 11c[^>]*\/>/)[0]}</g>${Array.from({ length: 6 }, (_, i) => `<circle class="cq-sparkle cq-sparkle-fly" cx="${6 + i * 2.4}" cy="8" r="1.3"/>`).join('')}`);
            chest.querySelectorAll('.cq-sparkle-fly').forEach((spark, i) => { spark.style.setProperty('--dx', `${(i - 2.5) * 3}px`); spark.style.setProperty('--dy', `${-10 - (i % 3) * 4}px`); });
        };
        // Po překreslení: vlaječka se zapíchne, opevnění vyroste s obláčkem prachu
        const dropPin = (id) => { const pin = svg && svg.querySelector(`[data-pin="${id}"]`); if (pin) pin.classList.add('cq-pin-drop'); };
        const riseIcon = (id) => {
            const mark = svg && svg.querySelector(`[data-mark="${id}"]`);
            const icon = mark && mark.querySelector('.cq-icon:not(.cq-treasure)');
            if (!icon) return;
            icon.classList.add('cq-rise');
            const scale = mark.querySelector('.cq-mark-scale');
            if (scale) scale.insertAdjacentHTML('beforeend', [[-6, -2], [4, 0], [14, -2]].map(([x, y]) => `<circle class="cq-dust cq-dust-puff" cx="${x}" cy="${y}" r="4"/>`).join(''));
        };
        const banner = (text, icon = 'sparkles') => {
            const holder = app.querySelector('[data-cq-banner]');
            if (!holder) return;
            holder.innerHTML = `<div class="cq-banner cq-banner-in flex max-w-full items-center gap-1.5 rounded-xl px-3 py-1.5 text-[14px]" role="status"><i data-lucide="${icon}" class="h-4 w-4 shrink-0"></i><span class="min-w-0">${esc(text)}</span></div>`;
            deps.renderIcons(holder);
            setTimeout(() => { if (holder.isConnected) holder.innerHTML = ''; }, reduced() ? 2400 : 2700);
        };

        // --- Tah: otázka a výsledek ---
        const startMove = async (kind, source) => {
            if (!game || !game.selected || game.move) return;
            const target = game.selected;
            const info = game.view.owners.get(target) || { level: 0 };
            const budget = game.view.budget || { period: 0, used: 0 };
            const move = { kind, target, source: kind === 'attack' ? (source || C.sourcesFor(game.view, target)[0] || null) : null, phase: 'loading', answered: null };
            game.move = move;
            const holder = sheet();
            if (holder) { holder.innerHTML = '<div class="cq-sheet rounded-t-2xl p-4 text-center text-sm font-bold text-slate-600 dark:text-slate-300">Připravuji otázku…</div>'; }
            let loaded = {};
            try { loaded = await topics(); } catch (error) { loaded = {}; }
            if (!game || game.move !== move) return;
            move.question = C.buildQuestion({ data: game.data, territory: target, level: info.level || 0, topics: loaded, seed: `${game.id}|${kind}|${budget.period}|${budget.used}` });
            if (!move.question) { game.move = null; deps.showToast('Otázku se nepodařilo připravit. Zkus jiné území.'); showSheet(target); return; }
            move.phase = 'question';
            showMoveFx(move);
            if (holder) holder.innerHTML = '';
            await wait(kind === 'attack' ? 700 : 250);
            if (!game || game.move !== move) return;
            renderQuestion();
        };
        const questionTitle = (move) => {
            const name = game.view.index.byId.get(move.target).n;
            if (move.kind === 'fortify') {
                const info = game.view.owners.get(move.target) || { level: 0 };
                return `Opevnění: ${name} → ${C.LEVELS[info.level + 1].name}`;
            }
            return move.source ? `Útok: ${game.view.index.byId.get(move.source).n} → ${name}` : `Útok: ${name}`;
        };
        const renderQuestion = () => {
            const holder = sheet();
            const move = game && game.move;
            if (!holder || !move || !move.question) return;
            holder.innerHTML = C.questionHtml(move.question, { title: questionTitle(move), item: game.view.index.byId.get(move.target), data: game.data, answered: move.answered });
            deps.renderIcons(holder);
        };
        const answer = async (index) => {
            const move = game && game.move;
            if (!move || move.phase !== 'question' || !move.question.choices[index]) return;
            const correct = Boolean(move.question.choices[index].correct);
            move.answered = index;
            move.phase = 'sending';
            renderQuestion();
            sound(correct ? 'correct' : 'wrong');
            const before = game.view;
            let result = null;
            let failure = null;
            await Promise.all([
                Social.conquestMove(game.id, move.target, move.kind, correct, move.source).then(state => { result = state; }, error => { failure = error; }),
                wait(1200)
            ]);
            if (!game || game.move !== move) return;
            const holder = sheet();
            if (holder) holder.innerHTML = '';
            game.selected = null;
            highlight();
            if (failure || !result) {
                clearFx();
                game.move = null;
                deps.showToast(errorText(failure, 'Tah se nepodařilo uložit.'));
                reloadGame();
                return;
            }
            await playResult(before, result, move);
        };
        const playResult = async (before, state, move) => {
            const done = state.move || { r: 'fail' };
            const meId = before.me ? before.me.id : null;
            const target = move.target;
            const info = before.owners.get(target) || {};
            const impact = move.curve ? impactPoint(move.curve, target) : game.view.index.byId.get(target).a;
            if (done.r === 'capture') {
                burstAt(impact);
                if (info.treasure) openChest(target);
                if (info.home) crumbleIcon(target);
                await wait(info.home || info.treasure ? 550 : 250);
                inkSpread(target, impact, before.me);
                await wait(1150);
            } else if (done.r === 'breach') {
                burstAt(impact);
                crumbleIcon(target);
                await wait(850);
            } else if (done.r === 'fail' && move.kind === 'attack') {
                breakArrow(move);
                shakeTerritory(target);
                await wait(800);
            } else if (done.r === 'fail') {
                shakeTerritory(target);
                await wait(600);
            }
            clearFx();
            setState(state);
            repaintMap();
            const name = game.view.index.byId.get(target).n;
            if (done.r === 'capture') {
                dropPin(target);
                const regionsBefore = new Set(before.regionsOf(meId));
                const fresh = game.view.regionsOf(meId).filter(id => !regionsBefore.has(id));
                if (fresh.length) {
                    const region = game.view.index.regionById.get(fresh[0]);
                    const glow = svg && svg.querySelector(`[data-region="${fresh[0]}"]`);
                    if (glow) glow.classList.add('cq-region-new');
                    sound('record');
                    banner(`Celý region ${region.n} je tvůj! +1 tah za období a +${C.REGION_POINTS} body`, 'crown');
                } else if (info.treasure) { sound('badge'); banner('Poklad! Máš o 1 tah víc.', 'gem'); }
                else if (info.home) banner(`Domovský hrad dobyt! Kořist: +1 tah v dalším období.`, 'castle');
                else banner(`${name}: ${C.capturedWord(game.view.index.byId.get(target))}`, 'flag');
            } else if (done.r === 'breach') {
                if (done.l > 0) riseIcon(target);
                banner(`${C.LEVELS[done.l + 1].name} pobořena. ${done.l ? `Zbývá ${C.LEVELS[done.l].name}.` : 'Další úspěšný útok území dobude.'}`, 'hammer');
            } else if (done.r === 'fortify') {
                riseIcon(target);
                banner(`${name}: ${C.LEVELS[done.l].name}`, 'shield-check');
            } else banner(move.kind === 'attack' ? (info.owner ? 'Útok odražen.' : 'Útok nevyšel.') : 'Opevnění se nepovedlo.', 'x');
            game.move = null;
            paintCard();
        };
        const reloadGame = async () => {
            if (!game) return;
            const id = game.id;
            try {
                const state = await Social.conquestState(id);
                if (!game || game.id !== id || game.move) return;
                const changed = JSON.stringify([state.status, state.territories, (state.moves || []).slice(-1), state.budget]) !== JSON.stringify([game.state.status, game.state.territories, (game.state.moves || []).slice(-1), game.state.budget]);
                const finishedNow = state.status === 'finished' && !game.view.finished;
                setState(state);
                if (finishedNow) { renderGame(); claim(id); showResult(); return; }
                if (changed) repaintMap();
                updateClock();
            } catch (error) { /* další pokus při příštím obnovení */ }
        };
        const updateClock = () => {
            const clock = app.querySelector('[data-cq-clock]');
            if (!clock || !game) return;
            const end = Date.parse(game.state.ends_at || '');
            clock.textContent = game.view.finished ? 'Hra skončila' : Number.isFinite(end) ? `zbývá ${C.timeLeft(end - Date.now())}` : '';
        };

        // --- Konec hry: stupně vítězů, odměna, přehrání ---
        const showResult = () => {
            const holder = sheet();
            if (!holder || !game) return;
            holder.innerHTML = `<div class="cq-sheet cq-sheet-in max-h-[75vh] overflow-y-auto rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="Výsledky">
                <div class="mb-1 flex items-center gap-2"><h2 class="min-w-0 flex-1 text-[17px] font-black text-slate-900 dark:text-white">Konec hry</h2>
                <button type="button" data-cq="sheet-close" class="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400" aria-label="Zavřít"><i data-lucide="x" class="h-5 w-5"></i></button></div>
                ${C.resultHtml(game.view, { reward: rewards.get(game.id) || null })}</div>`;
            deps.renderIcons(holder);
        };
        let replaying = 0;
        const replay = async () => {
            if (!game || !game.state.history) return;
            const token = ++replaying;
            const steps = C.replaySteps(game.state.history);
            const holder = sheet();
            if (holder) holder.innerHTML = '';
            const final = game.state;
            const owners = {};
            const unit = final.period === 'hour' ? 'Hodina' : 'Den';
            for (const step of steps) {
                if (!game || replaying !== token || !active()) return;
                const changed = [];
                for (const change of step.changes) { owners[change.t] = change.owner; changed.push(change.t); }
                game.view = viewFor({ ...final, status: 'finished', territories: game.data.t.map(item => ({ t: item.id, o: owners[item.id] || null, l: 0, h: false, p: false })) }, game.data);
                repaintMap();
                changed.forEach(id => { const wash = svg && svg.querySelector(`[data-wash="${id}"]`); if (wash) wash.classList.add('cq-replay-flash'); });
                banner(`${unit} ${step.period + 1}`, 'repeat');
                await wait(steps.length > 30 ? 450 : 750);
            }
            if (!game || replaying !== token) return;
            setState(final);
            repaintMap();
            showResult();
        };

        // --- Klepnutí (rozcestník i hra) ---
        const onClick = (event) => {
            if (!active()) return;
            const target = event.target;
            const tab = target.closest('[data-cq-tab]');
            if (tab) { ui.kind = 'hub'; ui.tab = tab.dataset.cqTab; ui.error = ''; renderHub(); if (ui.tab !== 'create') loadLobby().then(() => renderHub()); return; }
            const play = target.closest('[data-cq-play]');
            if (play) { openGame(play.dataset.cqPlay); return; }
            const join = target.closest('[data-cq-join]');
            if (join) { joinGame({ id: join.dataset.cqJoin }); return; }
            const open = target.closest('[data-cq-lobby]');
            if (open) { openLobby(open.dataset.cqLobby); return; }
            const set = target.closest('[data-cq-set]');
            if (set && !set.disabled) {
                const key = set.dataset.cqSet;
                draft[key] = ['hours', 'players'].includes(key) ? Number(set.dataset.value) : set.dataset.value;
                if (key === 'map') { const data = maps[draft.map]; if (data) draft.players = Math.min(draft.players, data.maxPlayers); }
                saveDraft();
                renderHub();
                return;
            }
            const step = target.closest('[data-cq-step]');
            if (step && !step.disabled) {
                const key = step.dataset.cqStep;
                const data = maps[draft.map];
                const max = key === 'players' ? (data ? data.maxPlayers : C.MAX_PLAYERS) : C.MAX_ACTIONS;
                const min = key === 'players' ? C.MIN_PLAYERS : 1;
                draft[key] = Math.min(max, Math.max(min, Number(draft[key]) + Number(step.dataset.delta)));
                saveDraft();
                renderHub();
                return;
            }
            const source = target.closest('[data-cq-source]');
            if (source && game) { game.source = source.dataset.cqSource; showSheet(game.selected); return; }
            const answerButton = target.closest('[data-cq-answer]');
            if (answerButton && !answerButton.disabled) { answer(Number(answerButton.dataset.cqAnswer)); return; }
            const action = target.closest('[data-cq]');
            if (!action) return;
            const name = action.dataset.cq;
            if (name === 'help') deps.showDialog('Jak se hraje Dobývání', C.helpHtml());
            else if (name === 'code') openCode();
            else if (name === 'look') { if (ui.kind === 'lobby') changeLook(); else pickLook({ onDone: () => renderHub() }); }
            else if (name === 'ready') toggleReady();
            else if (name === 'leave') leaveLobby();
            else if (name === 'share') shareGame(findGame(ui.gameId));
            else if (name === 'hub') openHub('mine');
            else if (name === 'feed' && game) deps.showDialog('Kronika tažení', C.feedHtml(C.feedItems(game.state.moves || [], game.view)));
            else if (name === 'zoom-reset' && game) { game.vb = { x: 0, y: 0, w: game.data.w, h: game.data.h }; applyView(); }
            else if (name === 'sheet-close') closeSheet();
            else if (name === 'attack') startMove('attack', action.dataset.source || game.source);
            else if (name === 'fortify') startMove('fortify');
            else if (name === 'replay') replay();
        };
        const onSubmit = (event) => {
            if (!active() || !event.target.closest('[data-cq-form]')) return;
            event.preventDefault();
            createGame();
        };
        app.addEventListener('click', onClick);
        app.addEventListener('submit', onSubmit);
        if (root.ResizeObserver) new root.ResizeObserver(() => { if (active() && game && svg) updateDetail(); }).observe(app);

        // Obnovování: rozehraná hra a čekající lobby (jen viditelná obrazovka)
        let timer = 0;
        const schedule = () => {
            clearTimeout(timer);
            if (!active()) return;
            const delay = ui.kind === 'game' ? POLL_GAME : ui.kind === 'lobby' ? POLL_LOBBY : 30000;
            timer = setTimeout(tick, delay);
        };
        const tick = async () => {
            if (!active()) return;
            if (!doc.hidden) {
                if (ui.kind === 'game' && game && !game.move && !replaying) await reloadGame();
                else if (ui.kind === 'lobby' && ui.gameId) {
                    try {
                        const state = await Social.conquestState(ui.gameId);
                        if (state.status === 'running') { upsertMine(state); deps.showToast('Hra začala!'); openGame(state.id); return; }
                        const before = JSON.stringify(findGame(ui.gameId));
                        upsertMine(state);
                        if (JSON.stringify(findGame(ui.gameId)) !== before && active() && ui.kind === 'lobby') renderHub();
                    } catch (error) { /* další pokus později */ }
                } else if (ui.kind === 'hub') { await loadLobby(); renderHub(); }
            }
            updateClock();
            schedule();
        };

        // Zpět (tlačítko telefonu, app.js goBack): list → mapa → rozcestník → úvod
        const back = () => {
            if (game && game.move) { if (game.move.phase === 'sending') return true; clearFx(); game.move = null; closeSheet(); return true; }
            if (replaying && game) { replaying++; setState(game.state); repaintMap(); return true; }
            if (game && sheet() && sheet().innerHTML) { closeSheet(); return true; }
            if (ui.kind === 'game' || ui.kind === 'lobby') { openHub('mine'); return true; }
            clearTimeout(timer);
            return false;
        };
        // Probíhá tah (oslavy z app.js počkají)
        const busy = () => Boolean(game && game.move);

        return { cardHtml, paintCard, refresh, reset, openHub, openGame, openCode, afterLogin, takeLink, back, busy, parseCode };
    };

    return { createUI, STORE, LINK_PARAM, PENDING_KEY, parseCode };
});
