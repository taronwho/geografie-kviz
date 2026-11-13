// Dobývání v prohlížeči (pravidla a vykreslení jsou v conquest.js): karta na záložce Více hráčů, rozcestník (Moje hry s pozvánkami
// od přátel, Lobby, Založit hru s výběrem přátel k pozvání), detail otevřené hry (Chci hrát, Odejít, Pozvat přátele, sdílení odkazu,
// Barva a znak, pozvaní „Pozváno“), obrazovka hry s mapou (posun a přiblížení prsty,
// kolečkem i dvojitým klepnutím), spodní list území, otázka tahu (připraví se už při otevření listu; otázka Mudrlanta s popisem,
// fakty nebo obrázkem přes celou obrazovku hry, ostatní ve spodním listu) a animace výsledku (šipka útoku, rozlití inkoustu z místa útoku,
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
    // Bitvy o území (blok 25): puls hry každé 3 s, během bitvy (moje nebo otevřená na mapě) každých 1,5 s; čas na odpověď 60 s
    const POLL_PULSE = 3000;
    const POLL_BATTLE = 1500;
    const BATTLE_MS = 60000;
    const POLL_LOBBY = 7000;
    const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
    const parseCode = (text) => {
        const raw = String(text || '');
        const fromLink = raw.match(/[?&#]dobyvani=([A-Za-z0-9-]+)/);
        const code = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[\s-]/g, '');
        return CODE_PATTERN.test(code) ? code : '';
    };

    // deps: Conquest (conquest.js), Social, appContent, signedUser, login, enter (obrazovka 'conquest'), isActive, renderHome, renderIcons,
    // showDialog, closeDialog, showToast, loadMap(id), loadTopics(), roundFor(požadavek otázky Mudrlanta → obsah, conquest.js prepareQuestion),
    // award({ xp, badge, place }), share(payload), sound(name), touchTip, onCard(),
    // avatarHtml(hráč, třídy) a friends() (přijatí přátelé pro okno Pozvat přátele; null = nenačetli se)
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
        // Vývojářský režim (app.js devOn): lišta s boty v lobby a ve hře
        const devOn = () => Boolean(deps.dev && deps.dev());
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
        // Otázka tahu (conquest.js prepareQuestion): chystá se už při otevření listu území, takže popis z Wikipedie a obrázek
        // (deps.roundFor, app.js) se načítají, než hráč klepne na Zaútočit; po ROUND_TIMEOUT nebo bez sítě místní otázka. Stejné
        // semínko (hra, druh tahu, období, tahy, počet otázek ve hře) dá i po znovuotevření stejnou otázku. window.MUDRLANT_CONQUEST_ONLY
        // = jen tato forma otázky (testy)
        let prepared = null; // { key, promise }
        const prepare = (target, kind) => {
            const info = game.view.owners.get(target) || { level: 0 };
            const budget = game.view.budget || { period: 0, used: 0 };
            const asked = askedIn(game.id);
            const only = typeof root.MUDRLANT_CONQUEST_ONLY === 'string' ? root.MUDRLANT_CONQUEST_ONLY : null;
            const seed = `${game.id}|${kind}|${budget.period}|${budget.used}|${asked.answers.length}`;
            const key = `${target}|${info.level || 0}|${seed}|${only || ''}`;
            if (prepared && prepared.key === key) return prepared.promise;
            const data = game.data;
            const promise = topics().catch(() => ({})).then(loaded => C.prepareQuestion({ data, territory: target, level: info.level || 0, topics: loaded, seed, avoid: asked, only,
                roundFor: deps.roundFor || null, timeout: C.ROUND_TIMEOUT }));
            promise.catch(() => null);
            prepared = { key, promise };
            return promise;
        };

        // --- Lobby a moje hry ---
        let lobby = null; // { open, mine, invites (pozvánky od přátel, blok 24) }
        let lobbyAt = 0;
        let lobbyLoading = null;
        let lobbyError = '';
        let missing = false;
        // Databáze bez pozvánek (blok 24 chybí, 404): Pozvat přátele se neukáže, zbytek Dobývání běží dál
        let invitesOff = false;
        const loadInvites = () => (invitesOff || !Social.conquestInvitesMine ? Promise.resolve([]) : Social.conquestInvitesMine().catch(error => {
            if (error && error.status === 404) invitesOff = true;
            return (lobby && lobby.invites) || [];
        }));
        const loadLobby = () => {
            if (lobbyLoading) return lobbyLoading;
            lobbyLoading = (async () => {
                try {
                    const [data, invites] = await Promise.all([Social.conquestLobby(), loadInvites()]);
                    data.invites = invites;
                    lobby = data;
                    lobbyAt = Date.now();
                    lobbyError = '';
                    await Promise.all([...new Set([...data.mine, ...data.open, ...invites].map(game => game.map))].map(id => ensureMap(id).catch(() => null)));
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
        const findInvite = (id) => ((lobby && lobby.invites) || []).find(invite => invite.id === id) || null;
        const dropInvite = (id) => { if (lobby && lobby.invites) lobby.invites = lobby.invites.filter(invite => invite.id !== id); };
        const upsertMine = (game) => {
            if (!game || !lobby) return;
            const known = lobby.mine.find(item => item.id === game.id);
            lobby.mine = known ? lobby.mine.map(item => (item.id === game.id ? { ...item, ...game } : item)) : [game, ...lobby.mine];
            lobby.open = lobby.open.filter(item => item.id !== game.id);
        };

        // Karta na záložce Více hráčů
        const cardHtml = () => (deps.signedUser() && !missing ? C.homeCardHtml({ games: lobby ? lobby.mine : null, invites: lobby ? lobby.invites : [], maps, loading: Boolean(lobbyLoading), avatar: deps.avatarHtml }) : '');
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
        const reset = () => { lobby = null; lobbyAt = 0; missing = false; invitesOff = false; game = null; ui.kind = 'hub'; ui.tab = 'mine'; ui.invites = []; };

        // --- Rozcestník ---
        const prefs = readPrefs();
        // invites = přátelé vybraní ve formuláři Založit hru (pozvou se hned po založení; jen v paměti, ne v úložišti)
        const ui = { kind: 'hub', tab: 'mine', gameId: null, busy: false, error: '', confirmLeave: false, invites: [] };
        const draft = {
            map: 'evropa', hours: 72, players: 4, actions: 5, period: 'day', visibility: 'public',
            ...(prefs.draft || {}),
            color: C.COLOR_BY_ID[prefs.color] ? prefs.color : 'cervena', emblem: C.EMBLEM_BY_ID[prefs.emblem] ? prefs.emblem : 'lev'
        };
        if (!C.MAP_BY_ID[draft.map]) draft.map = 'evropa';
        // Tempo: délka kola a hry v minutách (dřívější volba v hodinách se převede); neplatná kombinace = výchozí délka pro to kolo
        if (!C.PERIODS.includes(draft.period)) draft.period = 'day';
        draft.minutes = Number(draft.minutes) || Number(draft.hours) * 60 || 4320;
        if (!C.LENGTHS[draft.period].includes(draft.minutes)) draft.minutes = C.defaultMinutes(draft.period);
        draft.custom = Boolean(draft.custom);
        const saveDraft = () => writePrefs({ draft: { map: draft.map, minutes: draft.minutes, players: draft.players, actions: draft.actions, period: draft.period, visibility: draft.visibility, custom: draft.custom } });

        const renderHub = () => {
            if (!active() || ui.kind === 'game') return;
            const now = Date.now();
            let body;
            const invites = lobby ? lobby.invites || [] : [];
            const mine = () => C.mineHtml({ games: lobby ? lobby.mine : null, invites, maps, now, error: lobbyError, avatar: deps.avatarHtml });
            if (ui.kind === 'lobby') {
                const found = findGame(ui.gameId);
                body = found ? C.lobbyDetailHtml({ game: found, maps, busy: ui.confirmLeave ? 'leave' : ui.busy, error: ui.error, dev: devOn(), invitable: !invitesOff, avatar: deps.avatarHtml }) : mine();
            } else if (ui.tab === 'lobby') body = C.lobbyHtml({ games: lobby ? lobby.open : null, maps, now, error: lobbyError });
            else if (ui.tab === 'create') { trimInvites(); body = C.createHtml({ draft, maps, busy: ui.busy, error: ui.error, invites: ui.invites, invitable: !invitesOff, avatar: deps.avatarHtml }); }
            else body = mine();
            const keep = app.scrollTop;
            app.innerHTML = C.hubHtml({ tab: ui.kind === 'lobby' ? 'mine' : ui.tab, body, invites: invites.length });
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

        // Přidání: veřejná hra podle id, soukromá kódem, s pozvánkou od přítele podle id (i soukromá)
        const joinGame = ({ id = null, code = '' }) => {
            const found = id ? findGame(id) || findInvite(id) : null;
            pickLook({
                taken: takenColors(found), title: 'Tvoje barva a znak',
                onDone: async ({ color, emblem }) => {
                    try {
                        const joined = await Social.conquestJoin({ game: id, code, color, emblem });
                        dropInvite(joined.id);
                        upsertMine(joined);
                        if (!lobby) await loadLobby();
                        await ensureMap(joined.map).catch(() => null);
                        deps.showToast(joined.status === 'running' ? 'Hra je plná a právě začala!' : 'Jsi ve hře. Počkej na ostatní, nebo klepni na Chci hrát.');
                        if (joined.status === 'running') openGame(joined.id); else openLobby(joined.id);
                        paintCard();
                    } catch (error) {
                        deps.showToast(errorText(error, 'Přidat se do hry se nepodařilo.'));
                        loadLobby().then(() => { renderHub(); paintCard(); });
                    }
                }
            });
        };
        // Pozvánka od přítele: Přidat se (barva a znak, pak do hry; nejdřív se otevře rozcestník, ať je za oknem vidět, kam hráč jde)
        const acceptInvite = (id) => {
            if (game && game.move) return;
            if (!active() || ui.kind !== 'hub') { stopGame(); ui.kind = 'hub'; ui.tab = 'mine'; ui.error = ''; if (!active()) deps.enter(); renderHub(); schedule(); }
            joinGame({ id });
        };
        // Z karty na záložce Více hráčů
        const openInvite = (id) => {
            if (!deps.signedUser()) { deps.login(); return; }
            if (findInvite(id)) { acceptInvite(id); return; }
            openHub('mine');
        };
        const declineInvite = async (id, button) => {
            if (button) button.disabled = true;
            try {
                await Social.conquestDeclineInvite(id);
                dropInvite(id);
                deps.showToast('Pozvánka odmítnuta.');
            } catch (error) {
                deps.showToast(errorText(error, 'Pozvánku se nepodařilo odmítnout.'));
            }
            renderHub();
            paintCard();
        };

        // Okno Pozvat přátele: target = hra v lobby (pozvánky odejdou hned), bez něj výběr do formuláře Založit hru (odejdou po založení)
        const invitesWord = (count) => (count === 1 ? 'Pozvánka je odeslaná.' : `Pozvánky jsou odeslané (${count}).`);
        const PICKER_TITLE = 'Pozvat přátele';
        const createLimit = () => { const data = maps[draft.map]; return Math.max(0, Math.min(draft.players, data ? data.maxPlayers : C.MAX_PLAYERS) - 1); };
        const trimInvites = () => { if (ui.invites.length > createLimit()) ui.invites = ui.invites.slice(0, createLimit()); };
        const openInvitePicker = (targetId = null) => {
            const create = !targetId;
            const state = { friends: null, loading: true, selected: create ? ui.invites.map(friend => friend.id) : [], busy: false, error: '' };
            const target = () => (create ? null : findGame(targetId));
            const limit = () => {
                if (create) return createLimit();
                const found = target();
                return found ? Math.max(0, found.max_players - found.players.length - (found.invited || []).length) : 0;
            };
            const open = () => { const overlay = doc.getElementById('dialog-overlay'); return Boolean(overlay && overlay.dataset.title === PICKER_TITLE); };
            const render = () => {
                const found = target();
                // Seznam se posouvá uvnitř okna: po překreslení (zaškrtnutí) zůstane na místě
                const list = doc.querySelector('[data-cq-friend-list]');
                const keep = list ? list.scrollTop : 0;
                deps.showDialog(PICKER_TITLE, C.friendsPickerHtml({
                    friends: state.friends, loading: state.loading, selected: state.selected, limit: limit(), avatar: deps.avatarHtml, busy: state.busy, error: state.error, create,
                    joined: found ? found.players.map(player => player.id) : [], invited: found ? (found.invited || []).map(player => player.id) : []
                }), { onClick });
                const fresh = doc.querySelector('[data-cq-friend-list]');
                if (fresh) fresh.scrollTop = keep;
            };
            const send = async () => {
                const found = target();
                if (!found || state.busy || !state.selected.length) return;
                state.busy = true;
                state.error = '';
                render();
                try {
                    const updated = await Social.conquestInvite(found.id, state.selected);
                    upsertMine(updated);
                    if (deps.touchTip) deps.touchTip('conquestInvite');
                    deps.closeDialog();
                    deps.showToast(invitesWord(state.selected.length));
                    if (active() && ui.kind === 'lobby') renderHub();
                } catch (error) {
                    state.busy = false;
                    state.error = errorText(error, 'Pozvánky se nepodařilo poslat.');
                    if (open()) render();
                }
            };
            const onClick = (event) => {
                const row = event.target.closest('[data-cq-friend]');
                if (row && !row.disabled && !state.busy) {
                    const id = row.dataset.cqFriend;
                    state.selected = state.selected.includes(id) ? state.selected.filter(other => other !== id) : [...state.selected, id];
                    state.error = '';
                    render();
                    return;
                }
                if (!event.target.closest('[data-cq="invite-done"]')) return;
                if (!create) { send(); return; }
                ui.invites = (state.friends || []).filter(friend => state.selected.includes(friend.id)).slice(0, createLimit());
                deps.closeDialog();
                renderHub();
            };
            render();
            Promise.resolve(deps.friends ? deps.friends() : []).catch(() => null).then(friends => {
                state.friends = Array.isArray(friends) ? friends : null;
                state.loading = false;
                // Vybraní, kteří mezitím přestali být přáteli, z výběru vypadnou
                if (state.friends) state.selected = state.selected.filter(id => state.friends.some(friend => friend.id === id));
                if (open()) render();
            });
        };
        const openCode = (initial = '', lookup = true) => {
            if (!deps.signedUser()) {
                const saved = parseCode(initial);
                if (saved) { try { const s = storage(); if (s) s.setItem(PENDING_KEY, saved); } catch (error) { /* kód se nezapamatuje */ } }
                deps.showDialog('Dobývání', `<p class="mb-4 text-sm text-slate-600 dark:text-slate-300">Někdo tě zve do hry Dobývání. Přihlas se a hned potom se přidáš.</p>
                    <button type="button" data-cq-login class="flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl btn-3d bg-brand-700 px-3 text-base font-black text-white"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>`,
                { onClick: (event) => { if (event.target.closest('[data-cq-login]')) deps.login(); } });
                return;
            }
            const state = { code: parseCode(initial) || '', error: '' };
            // Hra, kterou hráč už hraje (odkaz z upozornění na útok, vlastní pozvánka): rovnou mapa (nebo lobby), bez okna s kódem a barvou.
            // Rozehraný tah (otázka) se nepřeruší, otevřená hra se jen obnoví. Hra, do které hráče pozval přítel (upozornění „X tě zve do hry“):
            // rovnou Barva a znak a přidání. Kód cizí hry otevře okno s kódem jako dřív.
            if (lookup && state.code) {
                const known = () => (lobby ? lobby.mine.find(found => found.code === state.code) : null);
                const invited = () => ((lobby && lobby.invites) || []).find(invite => invite.code === state.code) || null;
                const go = (found) => {
                    if (game && game.move) return;
                    if (game && game.id === found.id && ui.kind === 'game' && active()) { reloadGame(); return; }
                    openGame(found.id);
                };
                const found = known();
                if (found) { go(found); return; }
                loadLobby().then(() => {
                    const later = known();
                    const invite = later ? null : invited();
                    if (later) go(later);
                    else if (invite) acceptInvite(invite.id);
                    else openCode(state.code, false);
                    paintCard();
                });
                return;
            }
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
                // Rychlé hry (kola po 5 a 10 minutách) mají délku v minutách, ostatní v hodinách
                const fast = draft.minutes < 360;
                let created = await Social.conquestCreate({ map: draft.map, players, hours: fast ? null : draft.minutes / 60, minutes: fast ? draft.minutes : null, period: draft.period, actions: draft.actions, visibility: draft.visibility, color: draft.color, emblem: draft.emblem });
                // Vybraní přátelé dostanou pozvánku hned po založení; když se to nepovede, hra zůstane a pozvat jde z jejího detailu
                const friends = ui.invites.map(friend => friend.id).slice(0, players - 1);
                let invited = 0;
                let inviteFailed = false;
                if (friends.length) {
                    try {
                        created = (await Social.conquestInvite(created.id, friends)) || created;
                        invited = friends.length;
                        if (deps.touchTip) deps.touchTip('conquestInvite');
                    } catch (error) { inviteFailed = true; }
                }
                ui.invites = [];
                ui.busy = false;
                if (!lobby) await loadLobby();
                upsertMine(created);
                deps.showToast(inviteFailed ? 'Hra je založená, ale pozvánky se nepodařilo poslat. Pozvi přátele znovu v detailu hry.'
                    : invited ? `Hra je založená. ${invitesWord(invited)}`
                        : draft.visibility === 'private' ? 'Hra je založená. Pošli ostatním kód.' : 'Hra je založená a čeká v Lobby na hráče.');
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
                game = { id, state, data, view: viewFor(state, data), vb: null, selected: null, source: null, move: null,
                    offset: 0, version: state.version || '', loadedAt: Date.now(), siegeKey: siegeKey(state.sieges),
                    // Bitvy, o kterých hráč už ví (při otevření hry ty, co už běží), a výsledky, které už viděl
                    seenSieges: new Set((state.sieges || []).map(siege => siege.id)), seenResults: new Set() };
                renderGame();
                if (penaltyNews(state)) deps.showToast(C.PENALTY_TEXT);
                // Témata a zásoby otázek pro mapu se připraví hned (první otázka pak nečeká na jejich sestavení)
                topics().then(loaded => { if (game && game.data === data) C.poolsOf(data, loaded); }).catch(() => null);
                if (game.view.finished) { if (!state.claimed) claim(id); finale(); }
                schedule();
            } catch (error) {
                deps.showToast(errorText(error, 'Hru se nepodařilo načíst.'));
                if (active()) openHub('mine');
            }
        };
        const stopGame = () => { if (game && game.move) clearFx(); clearTimeout(waitTimer); game = null; };
        // Ztracený hrad (budget.penalty): o tahu méně řekne toast jednou za období hry (po otevření hry, nebo se začátkem období)
        const penaltySeen = new Set();
        const penaltyNews = (state) => {
            const budget = state && state.budget;
            const key = budget ? `${state.id}:${budget.period}` : '';
            if (!budget || !budget.penalty || penaltySeen.has(key)) return false;
            penaltySeen.add(key);
            return true;
        };

        // Vykreslení obrazovky hry (přiblížení zůstane)
        const renderGame = () => {
            if (!game || !active()) return;
            app.innerHTML = C.gameScreenHtml(game.view, { dev: devOn() });
            app.scrollTop = 0;
            deps.renderIcons(app);
            const wrap = app.querySelector('[data-cq-wrap]');
            if (wrap) wrap.style.aspectRatio = `${game.data.w} / ${game.data.h}`;
            mountMap();
            if (game.selected) showSheet(game.selected);
            paintChips();
            startClock();
        };
        // Jen mapa a čísla (po tahu, při obnovení), bez přestavby celé obrazovky
        const repaintMap = () => {
            const holder = app.querySelector('[data-cq-map]');
            if (!holder || !game) { renderGame(); return; }
            holder.innerHTML = C.mapSvg(game.data, game.view);
            const players = app.querySelector('[data-cq-players]');
            if (players) players.innerHTML = C.playersStripHtml(game.view, { now: Date.now() });
            const recent = app.querySelector('[data-cq-recent]');
            if (recent) recent.innerHTML = C.recentHtml(game.view, { now: Date.now() });
            const budget = app.querySelector('[data-cq-budget]');
            if (budget && game.view.budget) { budget.innerHTML = C.budgetInnerHtml(game.view.budget); budget.title = C.budgetTitle(game.view.budget); }
            deps.renderIcons(app.querySelector('[data-cq-panel]') || app);
            if (budget) deps.renderIcons(budget);
            mountMap();
            highlight();
            paintChips();
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
            // Název jen u vybraného území (ostatní názvy by napovídaly), vždy aspoň 12 a nejvýš 16 px na displeji
            svg.querySelectorAll('.cq-label').forEach(element => {
                const base = Number(element.dataset.size) || 10;
                const hide = element.dataset.label !== game.selected;
                element.classList.toggle('cq-hide', hide);
                if (hide) return;
                const size = Math.max(12 * upp, Math.min(base, 16 * upp));
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
            // Vybrané území a pod ním jemně obrys celého jeho regionu (celý region = +1 tah za období a body navíc)
            const region = item ? game.view.index.regionById.get(item.reg) : null;
            const outline = region && region.d && region.t.length > 1 ? `<path class="cq-select-region-halo" d="${region.d}"/><path class="cq-select-region" d="${region.d}"/>` : '';
            layer.innerHTML = item ? `${outline}<path class="cq-select-item" d="${item.d}"/>` : '';
            updateDetail();
        };
        const sheet = () => app.querySelector('[data-cq-sheet]');
        // Obsah spodního listu; full = otázka Mudrlanta přes celou obrazovku hry (list sahá až nahoru)
        const fillSheet = (html, full = false) => {
            const holder = sheet();
            if (!holder) return null;
            // Otázka Mudrlanta: list smí sahat až nahoru, ale je vysoký podle obsahu (prázdné místo nad ním propouští klepnutí na mapu)
            ['top-0', 'flex', 'flex-col', 'justify-end', 'pointer-events-none'].forEach(name => holder.classList.toggle(name, Boolean(full)));
            holder.innerHTML = html;
            if (html) deps.renderIcons(holder);
            return holder;
        };
        const selectTerritory = (id) => {
            if (!game) return;
            game.selected = id;
            game.source = null;
            highlight();
            showSheet(id);
        };
        const showSheet = (id) => {
            if (!sheet() || !game) return;
            fillSheet(C.sheetHtml(game.view, id, { source: game.source, offset: game.offset, now: Date.now() }));
            // Otázka tahu se chystá hned (popis a obrázek se načítají, než hráč klepne na Zaútočit nebo Opevnit)
            const actions = C.actionsFor(game.view, id);
            if (actions.attack || actions.fortify) prepare(id, actions.attack ? 'attack' : 'fortify');
        };
        const closeSheet = () => {
            fillSheet('');
            clearFinale();
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
            // Kresba truhly má víko, které se odklopí; obrázek truhly (č. 263) jen poskočí. Jiskry vyletí v obou případech
            const lid = C.iconMarkup('treasure').match(/<path d="M3 11c[^>]*\/>/);
            chest.insertAdjacentHTML('beforeend', `${lid ? `<g class="cq-lid-open">${lid[0]}</g>` : ''}${Array.from({ length: 6 }, (_, i) => `<circle class="cq-sparkle cq-sparkle-fly" cx="${6 + i * 2.4}" cy="8" r="1.3"/>`).join('')}`);
            if (!lid) chest.classList.add('cq-chest-pop');
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
            const move = { kind, target, source: kind === 'attack' ? (source || C.sourcesFor(game.view, target)[0] || null) : null, phase: 'loading', answered: null };
            game.move = move;
            fillSheet('<div class="cq-sheet rounded-t-2xl p-4 text-center text-sm font-bold text-slate-600 dark:text-slate-300" role="status">Připravuji otázku…</div>');
            let question = null;
            try { question = await prepare(target, kind); } catch (error) { question = null; }
            if (!game || game.move !== move) return;
            prepared = null;
            move.question = question;
            if (!move.question) { game.move = null; deps.showToast('Otázku se nepodařilo připravit. Zkus jiné území.'); showSheet(target); return; }
            rememberAsked(game.id, move.question);
            const battle = kind === 'attack' && battlesOn();
            move.phase = battle ? 'loading' : 'question';
            showMoveFx(move);
            if (!battle) fillSheet('');
            await wait(kind === 'attack' ? 700 : 250);
            if (!game || game.move !== move) return;
            // Bitva: otázka se ukáže, až server obléhání založí (od té chvíle běží 60 s)
            if (battle) { beginBattle(move); return; }
            renderQuestion();
        };
        // Otázky, které hráč v této hře už dostal (v zařízení): položka se ve hře neopakuje a stejná forma otázky nejde dvakrát po sobě
        const ASKED_KEY = 'mudrlant.conquestAsked';
        const askedAll = () => { try { const s = storage(); const value = s ? JSON.parse(s.getItem(ASKED_KEY) || '{}') : {}; return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (error) { return {}; } };
        const askedIn = (gameId) => {
            const entry = askedAll()[gameId] || {};
            return { answers: Array.isArray(entry.a) ? entry.a.map(String) : [], forms: Array.isArray(entry.f) ? entry.f.map(String) : [] };
        };
        const rememberAsked = (gameId, question) => {
            try {
                const s = storage();
                if (!s) return;
                const all = askedAll();
                const entry = askedIn(gameId);
                const key = C.answerKey(question);
                all[gameId] = { a: [...entry.answers, key].filter(Boolean).slice(-300), f: [...entry.forms, question.form || question.family].slice(-6), t: Date.now() };
                // Jen posledních 20 her
                const keep = Object.entries(all).sort((x, y) => (y[1].t || 0) - (x[1].t || 0)).slice(0, 20);
                s.setItem(ASKED_KEY, JSON.stringify(Object.fromEntries(keep)));
            } catch (error) { /* bez úložiště se jen může otázka zopakovat */ }
        };
        // Otázka tahu: ve spodním listu, otázka Mudrlanta (popis, fakta, obrázek) přes celou obrazovku hry; záhlaví „Útok na Francii“
        // nebo „Opevnění Francie“ (v bitvě „Bitva o Francii“) s hvězdami obtížnosti
        const questionTitle = (move, item) => (move.battle ? `Bitva o ${C.accusativeOf(item)}` : C.moveTitle(move.kind, item));
        const renderQuestion = () => {
            const move = game && game.move;
            if (!sheet() || !move || !move.question) return;
            const item = game.view.index.byId.get(move.target);
            const battle = move.battle ? { deadline: move.deadline, now: Date.now(), fighters: move.fighters || [] } : null;
            // Čekání v bitvě: krátce ve spodním listu (moje odpověď a kdo ještě odpovídá), i u otázky Mudrlanta
            const footer = move.battle && move.phase === 'waiting' && move.siege ? C.battleWaitHtml(game.view, move.siege, { ...(move.mine || {}), offset: game.offset, now: Date.now() }) : '';
            const holder = fillSheet(C.questionHtml(move.question, { title: questionTitle(move, item), item, data: game.data, answered: move.answered, kind: move.kind,
                correctIndex: move.correctIndex ?? null, battle, view: game.view, footer, compact: Boolean(footer) }), C.isFullQuestion(move.question) && !footer);
            if (!holder) return;
            // List vyjede jen poprvé; po odpovědi (a v bitvě při čekání) se jen překreslí
            if (move.shown) { const panel = holder.firstElementChild; if (panel) panel.classList.remove('cq-sheet-in'); }
            move.shown = true;
            if (battle) battleClock();
            // Náhled vlajky nebo znaku z Commons, který nejde načíst, nahradí původní soubor (data-fallback, jednou)
            holder.querySelectorAll('img[data-fallback]').forEach(img => {
                const swap = () => { const next = img.dataset.fallback; img.removeAttribute('data-fallback'); if (next && img.src !== next) img.src = next; };
                if (img.complete && img.naturalWidth === 0 && img.src) swap();
                else img.addEventListener('error', swap, { once: true });
            });
        };
        const answer = async (index) => {
            const move = game && game.move;
            if (!move || move.phase !== 'question' || !move.question.choices[index]) return;
            if (move.battle) { answerBattle(index); return; }
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
            fillSheet('');
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
            } else if ((done.r === 'fail' || done.r === 'outrun') && move.kind === 'attack') {
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
            } else if (move.battle) {
                // Bitva: kdo vyhrál (rychlejší správná odpověď), nebo proč tah propadl
                const winner = move.siegeResult ? move.siegeResult.participants.find(player => player.winner) : null;
                const who = winner ? (game.view.byId.get(winner.id) || winner).display_name || 'soupeř' : '';
                if (done.r === 'outrun') banner(`Správně, ale rychlejší odpověď: ${who || 'soupeř'}. Tah propadl.`, 'timer');
                else if (who) banner(`Bitvu vyhrává ${who}.`, 'swords');
                else banner(move.answered === -1 ? 'Čas vypršel. Tah propadl.' : info.owner ? 'Útok odražen.' : 'Útok nevyšel.', 'x');
            } else banner(move.kind === 'attack' ? (info.owner ? 'Útok odražen.' : 'Útok nevyšel.') : 'Opevnění se nepovedlo.', 'x');
            game.move = null;
            paintCard();
        };

        // --- Bitvy o území (blok 25): obléhání, přidání, odpočet 60 s, čekání na ostatní a výsledek ---
        // Databáze bitvy umí (conquest_state vrací sieges) a puls nehlásí, že blok 25 chybí; jinak útok postaru (conquestMove)
        const battlesOn = () => Boolean(game && game.view.battles && Social.conquestPulse && !(Social.conquestSiegesMissing && Social.conquestSiegesMissing()));
        const siegeKey = (sieges) => JSON.stringify((sieges || []).map(siege => [siege.id, siege.participants ? siege.participants.length : 0, Boolean(siege.can_join), Boolean(siege.answered)]));
        // Posun hodin serveru proti zařízení (odhad ze středu dotazu); všechny termíny bitev jsou serverové
        const serverCall = async (work) => {
            const sentAt = Date.now();
            const result = await work();
            const time = Date.parse((result && result.now) || '');
            if (game && Number.isFinite(time)) game.offset = time - (sentAt + Date.now()) / 2;
            return result;
        };
        const applyBudget = (budget) => {
            if (!game || !budget) return;
            game.state = { ...game.state, budget };
            game.view = viewFor(game.state, game.data);
            const chip = app.querySelector('[data-cq-budget]');
            if (chip) { chip.innerHTML = C.budgetInnerHtml(budget); chip.title = C.budgetTitle(budget); deps.renderIcons(chip); }
        };
        const failBattle = (move, error, fallback) => {
            if (!game || game.move !== move) return;
            clearFx();
            game.move = null;
            deps.showToast(errorText(error, fallback));
            pulse().then(() => { if (game && game.selected) showSheet(game.selected); });
        };
        // Útočník: obléhání začne a hned se ukáže otázka
        const beginBattle = async (move) => {
            let res;
            try { res = await serverCall(() => Social.conquestSiegeBegin(game.id, move.target, move.question, null, move.source)); } catch (error) { failBattle(move, error, 'Útok se nepodařilo zahájit.'); return; }
            if (!game || game.move !== move) return;
            enterBattle(move, res);
        };
        // Přidání do bitvy: šipka z vlastního sousedního území, otázka od serveru (stejná pro všechny, bez správné odpovědi)
        const joinBattle = async () => {
            if (!game || !game.selected || game.move) return;
            const target = game.selected;
            const siege = game.view.sieges.get(target);
            if (!siege) return;
            const move = { kind: 'attack', target, source: C.sourcesFor(game.view, target)[0] || null, phase: 'loading', answered: null, battle: true };
            game.move = move;
            fillSheet('<div class="cq-sheet rounded-t-2xl p-4 text-center text-sm font-bold text-slate-600 dark:text-slate-300" role="status">Vstupuješ do bitvy…</div>');
            showMoveFx(move);
            let res;
            try { res = await serverCall(() => Social.conquestSiegeJoin(siege.id, move.source)); } catch (error) { failBattle(move, error, 'Přidat se do bitvy se nepodařilo.'); return; }
            if (!game || game.move !== move) return;
            if (!res || !res.question || !Array.isArray(res.question.choices)) { failBattle(move, null, 'Otázku k bitvě se nepodařilo načíst.'); return; }
            move.question = res.question;
            sound('bossHit');
            enterBattle(move, res);
        };
        // Návrat do rozehrané bitvy (zavřená aplikace, jiná obrazovka): otázka a zbývající čas od serveru
        const resumeBattle = async (territory) => {
            if (!game || game.move) return;
            const siege = game.view.sieges.get(territory);
            if (!siege) return;
            game.selected = territory;
            highlight();
            const mineRow = siege.participants.find(player => player.me) || {};
            const move = { kind: 'attack', target: territory, source: mineRow.source || C.sourcesFor(game.view, territory)[0] || null, phase: 'loading', answered: null, battle: true };
            game.move = move;
            fillSheet('<div class="cq-sheet rounded-t-2xl p-4 text-center text-sm font-bold text-slate-600 dark:text-slate-300" role="status">Vracíš se do bitvy…</div>');
            showMoveFx(move);
            let res;
            try { res = await serverCall(() => Social.conquestSiegeStatus(siege.id)); } catch (error) { failBattle(move, error, 'Bitvu se nepodařilo načíst.'); return; }
            if (!game || game.move !== move) return;
            if (!res || !res.question) { failBattle(move, null, 'Bitva už skončila.'); return; }
            move.question = res.question;
            if (res.status === 'resolved' || res.answer) {
                move.correctIndex = Number.isInteger(res.correct_choice) ? res.correct_choice : null;
                move.answered = res.answer && Number.isInteger(res.answer.choice) ? res.answer.choice : -1;
                move.mine = res.answer ? { correct: res.answer.correct === true, answerMs: res.answer.answer_ms ?? null, late: res.answer.late === true } : { correct: false };
                move.siege = res;
                move.fighters = res.participants;
                move.deadline = C.localTime(res.deadline, game.offset) ?? Date.now();
                if (res.status === 'resolved') { settleBattle(move, res); return; }
                move.phase = 'waiting';
                renderQuestion();
                waitBattle(move);
                return;
            }
            enterBattle(move, res);
        };
        const enterBattle = (move, res) => {
            move.battle = true;
            move.siege = res;
            move.fighters = res.participants || [];
            move.deadline = C.localTime(res.deadline, game.offset) ?? Date.now() + BATTLE_MS;
            move.phase = 'question';
            applyBudget(res.budget);
            renderQuestion();
            startClock();
        };
        // Kdo se k mé bitvě přidal: vyskakovací zpráva nad otázkou, zvuk a praporek mezi účastníky
        const noteJoins = (move, participants) => {
            if (!move || !Array.isArray(participants)) return;
            const known = new Set((move.fighters || []).map(player => player.id));
            const fresh = participants.filter(player => !known.has(player.id) && !player.me);
            move.fighters = participants;
            if (!fresh.length || !game || game.move !== move) return;
            const row = app.querySelector('[data-cq-fighters]');
            if (row) { row.innerHTML = C.fightersHtml(game.view, participants); deps.renderIcons(row); }
            const holder = app.querySelector('[data-cq-joined]');
            if (holder) {
                holder.innerHTML = C.joinedHtml(game.view, fresh[fresh.length - 1]);
                deps.renderIcons(holder);
                const shown = holder.firstElementChild;
                setTimeout(() => { if (shown && shown.isConnected) shown.remove(); }, reduced() ? 2500 : 3200);
            }
            sound('bossHit');
            try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(60); } catch (error) { /* bez vibrace */ }
        };
        // Odpověď v bitvě (index, nebo null po vypršení času): vyhodnotí server; pak čekání na ostatní, nebo rovnou výsledek
        const answerBattle = async (index) => {
            const move = game && game.move;
            if (!move || !move.battle || move.phase !== 'question') return;
            move.answered = index === null ? -1 : index;
            move.phase = 'sending';
            renderQuestion();
            let res;
            try { res = await serverCall(() => Social.conquestSiegeAnswer(move.siege.id, index)); } catch (error) {
                if (!game || game.move !== move) return;
                // Před koncem času jde odpověď poslat znovu; po něm rozhodne server bez ní (výsledek přijde s pulsem)
                if (Date.now() < move.deadline - 500) { move.phase = 'question'; move.answered = null; renderQuestion(); deps.showToast(errorText(error, 'Odpověď se nepodařilo odeslat.')); return; }
                move.mine = { correct: false };
                move.phase = 'waiting';
                renderQuestion();
                waitBattle(move);
                return;
            }
            if (!game || game.move !== move) return;
            move.correctIndex = res.correct_choice;
            move.mine = { correct: res.correct, answerMs: res.answer_ms, late: res.late && index !== null };
            if (index !== null) sound(res.correct ? 'correct' : 'wrong');
            if (res.siege) { noteJoins(move, res.siege.participants); move.siege = res.siege; }
            if (res.status === 'resolved' && res.state) {
                renderQuestion();
                await wait(900);
                if (!game || game.move !== move) return;
                finishBattle(move, res.siege, res.move, res.state);
                return;
            }
            move.phase = 'waiting';
            renderQuestion();
            waitBattle(move);
        };
        // Čekání na ostatní: stav bitvy každých 1,5 s (kdo už odpověděl), po vyhodnocení výsledek
        let waitTimer = 0;
        const waitBattle = (move) => {
            clearTimeout(waitTimer);
            const step = async () => {
                if (!game || game.move !== move || move.phase !== 'waiting') return;
                try {
                    const siege = await serverCall(() => Social.conquestSiegeStatus(move.siege.id));
                    if (!game || game.move !== move) return;
                    noteJoins(move, siege.participants);
                    move.siege = siege;
                    if (siege.status === 'resolved') { settleBattle(move, siege); return; }
                    const box = app.querySelector('[data-cq-wait]');
                    if (box) { box.outerHTML = C.battleWaitHtml(game.view, siege, { ...(move.mine || {}), offset: game.offset, now: Date.now() }); deps.renderIcons(sheet()); }
                } catch (error) { /* další pokus */ }
                waitTimer = setTimeout(step, POLL_BATTLE);
            };
            waitTimer = setTimeout(step, POLL_BATTLE);
        };
        // Bitva skončila, když jsem čekal: čerstvý stav hry a výsledek
        const settleBattle = async (move, siege) => {
            let state = null;
            try { state = await Social.conquestState(game.id); } catch (error) { state = null; }
            if (!game || game.move !== move) return;
            if (!state) { clearFx(); game.move = null; closeSheet(); reloadGame(); return; }
            finishBattle(move, siege, siege.move, state);
        };
        const finishBattle = async (move, siege, myMove, state) => {
            clearTimeout(waitTimer);
            if (siege) game.seenResults.add(siege.id);
            move.siegeResult = siege;
            const before = game.view;
            fillSheet('');
            game.selected = null;
            highlight();
            game.version = state.version || game.version;
            game.siegeKey = siegeKey(state.sieges);
            game.loadedAt = Date.now();
            await playResult(before, { ...state, move: myMove || { r: 'fail' } }, move);
            if (game && siege && siege.participants.length > 1) showBattleResult(siege);
        };
        const showBattleResult = (siege) => {
            if (!sheet() || !game || game.move) return;
            fillSheet(C.battleResultHtml(game.view, siege));
        };
        // Zavřít čekání: bitva běží dál, výsledek přijde s pulsem (results)
        const hideBattle = () => {
            const move = game && game.move;
            if (!move || !move.battle || move.phase !== 'waiting') return;
            clearTimeout(waitTimer);
            clearFx();
            game.move = null;
            closeSheet();
        };
        // Štítky bitev dole na mapě (Přidat se / Vrátit se do bitvy)
        const paintChips = () => {
            const holder = app.querySelector('[data-cq-chips]');
            if (!holder || !game) return;
            const html = game.move ? '' : C.siegeChipsHtml(game.view, { offset: game.offset, now: Date.now() });
            if (holder.dataset.html === html) return;
            holder.dataset.html = html;
            holder.innerHTML = html;
            deps.renderIcons(holder);
        };
        // Hodiny bitev: pruh odpočtu v otázce (posledních 5 s tiká), odpočty u štítků a v oknech (data-cq-until); konec času = odpověď null
        let clockTimer = 0;
        const startClock = () => { if (!clockTimer) clockTimer = setInterval(uiClock, 250); };
        const battleClock = () => {
            const move = game && game.move;
            if (!move || !move.battle || !move.deadline) return;
            const left = move.deadline - Date.now();
            const fill = app.querySelector('[data-cq-timer]');
            if (fill) { fill.style.transform = `scaleX(${Math.max(0, Math.min(1, left / BATTLE_MS)).toFixed(4)})`; fill.classList.toggle('cq-timer-low', left < 10000); }
            const text = app.querySelector('[data-cq-timer-text]');
            if (text) text.textContent = move.phase === 'question' ? C.clockText(left) : '';
            if (move.phase !== 'question') return;
            const secs = Math.ceil(left / 1000);
            if (secs >= 1 && secs <= 5 && secs !== move.lastTick) { move.lastTick = secs; sound(secs === 1 ? 'tickLast' : 'tick'); }
            if (left <= 0) answerBattle(null);
        };
        const uiClock = () => {
            if (!game || !active() || ui.kind !== 'game') { clearInterval(clockTimer); clockTimer = 0; return; }
            battleClock();
            const now = Date.now();
            let expired = false;
            app.querySelectorAll('[data-cq-until]').forEach(element => {
                const left = Number(element.dataset.cqUntil) - now;
                element.textContent = C.clockText(left);
                if (left <= 0) expired = true;
            });
            if (expired && !game.move) paintChips();
        };
        // Puls hry: nové bitvy (upozornění, štítky, značky na mapě), kdo se přidal k mé bitvě, výsledky mých bitev a změny hry (version)
        const pulse = async () => {
            if (!game || !battlesOn()) return;
            const id = game.id;
            let res;
            try { res = await serverCall(() => Social.conquestPulse(id)); } catch (error) { return; }
            if (!game || game.id !== id) return;
            const move = game.move;
            const meId = game.view.me ? game.view.me.id : null;
            if (move && move.battle && move.siege) {
                const mine = res.sieges.find(siege => siege.id === move.siege.id);
                if (mine) noteJoins(move, mine.participants);
            }
            const fresh = res.sieges.filter(siege => !game.seenSieges.has(siege.id));
            fresh.forEach(siege => game.seenSieges.add(siege.id));
            const key = siegeKey(res.sieges);
            if (key !== game.siegeKey) {
                game.siegeKey = key;
                game.state = { ...game.state, sieges: res.sieges };
                game.view = viewFor(game.state, game.data);
                if (!move) { repaintMap(); if (game.selected) showSheet(game.selected); }
            }
            if (!move) {
                for (const siege of fresh) {
                    if (siege.started_by === meId || siege.mine) continue;
                    const item = game.view.index.byId.get(siege.territory);
                    if (!item) continue;
                    if (game.view.ownerOf(siege.territory) === meId) { banner(`${item.n}: tvoje území je obléhané!`, 'swords'); sound('bossHit'); }
                    else if (siege.can_join) { banner(`Bitva o ${C.accusativeOf(item)}: můžeš se přidat!`, 'swords'); sound('tick'); }
                }
            }
            // Výsledky mých bitev, na které jsem nečekal v listu (zavřené čekání, návrat do hry)
            const results = res.results.filter(siege => !game.seenResults.has(siege.id) && !(move && move.siege && move.siege.id === siege.id));
            results.forEach(siege => game.seenResults.add(siege.id));
            const changed = res.version && res.version !== game.version;
            if (res.version) game.version = res.version;
            if (!move && (changed || results.length || (res.status === 'finished' && !game.view.finished))) {
                await reloadGame(true);
                const last = results[results.length - 1];
                if (last && game && !game.move && !(sheet() && sheet().innerHTML)) showBattleResult(last);
            }
        };
        const reloadGame = async () => {
            if (!game) return;
            const id = game.id;
            try {
                const state = await Social.conquestState(id);
                if (!game || game.id !== id || game.move) return;
                game.loadedAt = Date.now();
                if (state.version) game.version = state.version;
                game.siegeKey = siegeKey(state.sieges);
                const changed = JSON.stringify([state.status, state.territories, (state.moves || []).slice(-1), state.budget, state.sieges]) !== JSON.stringify([game.state.status, game.state.territories, (game.state.moves || []).slice(-1), game.state.budget, game.state.sieges]);
                const finishedNow = state.status === 'finished' && !game.view.finished;
                const newPeriod = state.budget && game.state.budget && state.budget.period !== game.state.budget.period;
                setState(state);
                if (finishedNow) { renderGame(); claim(id); finale(); return; }
                if (changed) repaintMap();
                updateClock();
                // Hra zůstala otevřená do dalšího období: nové tahy (a po ztrátě hradu o tah méně)
                if (newPeriod) { penaltyNews(state); deps.showToast(C.periodStartText(state)); }
            } catch (error) { /* další pokus při příštím obnovení */ }
        };
        const updateClock = () => {
            const clock = app.querySelector('[data-cq-clock]');
            if (!clock || !game) return;
            const end = Date.parse(game.state.ends_at || '');
            clock.textContent = game.view.finished ? 'Hra skončila' : Number.isFinite(end) ? `zbývá ${C.timeLeft(end - Date.now())}` : '';
            const next = app.querySelector('[data-cq-next]');
            if (next) next.textContent = C.periodLine(game.view, Date.now());
        };

        // --- Konec hry: stupně vítězů, odměna, přehrání ---
        const showResult = () => {
            const holder = sheet();
            if (!holder || !game) return;
            holder.classList.remove('top-0');
            holder.innerHTML = `<div class="cq-sheet cq-result-sheet cq-sheet-in max-h-[78vh] overflow-y-auto rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="Výsledky">
                <div class="flex items-start gap-1"><span class="w-10 shrink-0"></span>
                <div class="flex min-w-0 flex-1 justify-center"><div class="cq-cartouche-art aspect-[29/10] h-[4.5rem] max-w-full px-[15%] pt-[4px] flex min-w-0 flex-col items-center justify-center text-center"><h2 class="cq-cartouche-title max-w-full truncate">Konec tažení</h2><span class="max-w-full truncate text-[10.5px] font-bold leading-3 text-amber-900/80">${esc(C.mapTitle(game.state.map))}</span></div></div>
                <button type="button" data-cq="sheet-close" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400" aria-label="Zavřít"><i data-lucide="x" class="h-5 w-5"></i></button></div>
                ${C.resultHtml(game.view, { reward: rewards.get(game.id) || null })}</div>`;
            deps.renderIcons(holder);
        };
        // Konec hry (poprvé): celá mapa, ostatní území zešednou a území vítěze se postupně rozzáří, přes mapu se rozvine kartuše
        // s vítězem (při vítězství sova s praporcem) a jiskry, pak vyjede list výsledků. Napodruhé (a při omezeném pohybu) hned list.
        const FINALE_KEY = 'mudrlant.conquestFinale';
        const finaleSeen = (id) => { try { const s = storage(); const list = s ? JSON.parse(s.getItem(FINALE_KEY) || '[]') : []; return Array.isArray(list) && list.includes(id); } catch (error) { return false; } };
        const markFinale = (id) => { try { const s = storage(); if (!s) return; const list = JSON.parse(s.getItem(FINALE_KEY) || '[]'); s.setItem(FINALE_KEY, JSON.stringify([id, ...(Array.isArray(list) ? list : []).filter(other => other !== id)].slice(0, 30))); } catch (error) { /* příště znovu */ } };
        const clearFinale = () => {
            const wrap = app.querySelector('[data-cq-wrap]');
            if (wrap) { wrap.classList.remove('cq-finale'); wrap.querySelectorAll('[data-cq-finale]').forEach(element => element.remove()); }
            const layer = fx();
            if (layer) layer.querySelectorAll('.cq-win-glow').forEach(element => element.remove());
        };
        const finale = async () => {
            if (!game) return;
            const id = game.id;
            const winner = game.view.ranking[0];
            if (!winner || finaleSeen(id) || reduced()) { showResult(); return; }
            markFinale(id);
            game.vb = { x: 0, y: 0, w: game.data.w, h: game.data.h };
            applyView();
            const wrap = app.querySelector('[data-cq-wrap]');
            const layer = fx();
            if (!wrap || !layer) { showResult(); return; }
            const winners = game.view.ranking.filter(player => player.place === 1);
            const ids = winners.flatMap(player => game.view.territoriesOf(player.id).map(tid => [tid, player]));
            wrap.classList.add('cq-finale');
            layer.insertAdjacentHTML('beforeend', ids.map(([tid, player]) => `<path class="cq-win-glow" d="${game.view.index.byId.get(tid).d}" fill="${player.color.hex}"/>`).join(''));
            layer.querySelectorAll('.cq-win-glow').forEach((element, i) => { element.style.animationDelay = `${Math.min(i * 70, 1400)}ms`; });
            await wait(1100);
            if (!game || game.id !== id || !wrap.isConnected) return;
            const me = winners.some(player => player.me);
            const title = me ? 'Vítězství!' : winners.length > 1 ? 'Vítězové tažení' : 'Vítěz tažení';
            const names = winners.map(player => (player.me ? 'Ty' : player.display_name || 'Hráč')).join(', ');
            wrap.insertAdjacentHTML('beforeend', `<div data-cq-finale class="cq-finale-banner pointer-events-none absolute inset-x-0 top-[12%] flex flex-col items-center px-3" role="status">
                ${me ? `<img src="icons/topics/${C.ART.victory || 'sova-vitez'}.webp" alt="" class="cq-finale-owl h-24 w-24 object-contain">` : `<span class="cq-finale-flag relative flex h-20 w-24 items-center justify-center">${C.ART.laurel ? `<img src="icons/topics/${C.ART.laurel}.webp" alt="" class="absolute inset-0 h-full w-full object-contain">` : ''}<span class="relative -mt-2">${C.pennantSvg(winner.flag_color, winner.emblem, 'h-10 w-[3.4rem]')}</span></span>`}
                <div class="cq-finale-scroll cq-cartouche-art aspect-[29/10] h-20 max-w-full px-[15%] pt-[4px] flex flex-col items-center justify-center text-center"><span class="cq-cartouche-title cq-cartouche-big">${esc(title)}</span><span class="max-w-full truncate text-[10.5px] font-bold leading-[1.2] text-amber-900/85">${esc(names)} · ${esc(C.pointsWord(winner.score))}</span></div>
                ${Array.from({ length: 10 }, () => '<i class="cq-finale-spark" aria-hidden="true"></i>').join('')}</div>`);
            wrap.querySelectorAll('.cq-finale-spark').forEach((spark, i) => {
                const angle = (i / 10) * Math.PI * 2;
                spark.style.left = `${50 + Math.cos(angle) * (30 + (i % 3) * 8)}%`;
                spark.style.top = `${32 + Math.sin(angle) * (16 + (i % 2) * 6)}%`;
                spark.style.animationDelay = `${(i % 5) * 120}ms`;
            });
            await wait(2300);
            if (!game || game.id !== id || !wrap.isConnected) return;
            wrap.querySelectorAll('[data-cq-finale]').forEach(element => element.classList.add('cq-finale-out'));
            showResult();
        };
        let replaying = 0;
        const replay = async () => {
            if (!game || !game.state.history) return;
            const token = ++replaying;
            const steps = C.replaySteps(game.state.history);
            fillSheet('');
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

        // --- Vývojář (vývojářský režim, účet v dev_admins): boti do lobby, jejich tahy hned, skok na další období ---
        // Server pustí jen účet z dev_admins a jen do hry, kterou sám hraje; boti pak hrají i sami (rozloží si tahy do období)
        let devBusy = false;
        const devRun = async (work) => {
            if (devBusy) return;
            devBusy = true;
            const buttons = [...app.querySelectorAll('[data-cq-dev] button')];
            buttons.forEach(button => { button.disabled = true; });
            try { await work(); } catch (error) { deps.showToast(errorText(error, 'Nepodařilo se.')); } finally {
                devBusy = false;
                buttons.forEach(button => { button.disabled = false; });
            }
        };
        const devAddBots = (count) => devRun(async () => {
            const found = findGame(ui.gameId);
            if (!found) return;
            const before = found.players.length;
            const updated = await Social.devConquestAddBots(found.id, count);
            upsertMine(updated);
            if (updated.status === 'running') { deps.showToast('Hra s boty začala!'); openGame(updated.id); return; }
            const added = updated.players.length - before;
            deps.showToast(added === 1 ? 'Bot je ve hře a chce hrát. Hra začne, až klepneš na Chci hrát.' : `Boti jsou ve hře (${added}) a chtějí hrát. Hra začne, až klepneš na Chci hrát.`);
            if (active() && ui.kind === 'lobby') renderHub();
        });
        const devBotsPlay = () => devRun(async () => {
            if (!game) return;
            const made = await Social.devConquestBotsPlay(game.id);
            deps.showToast(made ? `Boti odehráli ${C.movesWord(made)}.` : 'Boti už v tomhle období žádné tahy nemají.');
            await reloadGame();
        });
        const devNextPeriod = () => devRun(async () => {
            if (!game) return;
            const state = await Social.devConquestNextPeriod(game.id);
            if (!game || !state || game.id !== state.id) return;
            const finishedNow = state.status === 'finished' && !game.view.finished;
            setState(state);
            renderGame();
            if (finishedNow) { claim(state.id); finale(); return; }
            penaltyNews(state);
            deps.showToast(C.periodStartText(state));
        });

        // Jak se hraje: okno se záložkami (Základy, Útok, Regiony, Konec), přepínají se klepnutím i tlačítkem Dál
        const openHelp = (tab) => deps.showDialog('Jak se hraje Dobývání', C.helpHtml(tab), {
            onClick: (event) => { const next = event.target.closest('[data-cq-help-tab]'); if (next) openHelp(next.dataset.cqHelpTab); }
        });

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
            // Pozvánka od přítele (Moje hry): Přidat se, nebo Odmítnout
            const accept = target.closest('[data-cq-accept]');
            if (accept) { acceptInvite(accept.dataset.cqAccept); return; }
            const decline = target.closest('[data-cq-decline]');
            if (decline && !decline.disabled) { declineInvite(decline.dataset.cqDecline, decline); return; }
            const open = target.closest('[data-cq-lobby]');
            if (open) { openLobby(open.dataset.cqLobby); return; }
            const set = target.closest('[data-cq-set]');
            if (set && !set.disabled) {
                const key = set.dataset.cqSet;
                draft[key] = ['minutes', 'players'].includes(key) ? Number(set.dataset.value) : set.dataset.value;
                if (key === 'map') { const data = maps[draft.map]; if (data) draft.players = Math.min(draft.players, data.maxPlayers); }
                // Jiná délka kola: délka hry z nabídky pro to kolo (blíž původní, jinak výchozí)
                if (key === 'period' && !C.LENGTHS[draft.period].includes(draft.minutes)) draft.minutes = C.defaultMinutes(draft.period);
                saveDraft();
                renderHub();
                return;
            }
            // Tempo: předvolba (Blesk, Rychlovka, Odpoledne, Tažení) nastaví kolo, délku hry a tahy
            const tempo = target.closest('[data-cq-tempo]');
            if (tempo) {
                const preset = C.TEMPOS.find(item => item.id === tempo.dataset.cqTempo);
                if (preset) Object.assign(draft, { period: preset.period, minutes: preset.minutes, actions: preset.actions, custom: false });
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
            const chip = target.closest('[data-cq-siege-open]');
            if (chip && game && !game.move) {
                const siege = game.view.sieges.get(chip.dataset.cqSiegeOpen);
                if (siege && siege.mine && !siege.answered) resumeBattle(siege.territory); else selectTerritory(chip.dataset.cqSiegeOpen);
                return;
            }
            const source = target.closest('[data-cq-source]');
            if (source && game) { game.source = source.dataset.cqSource; showSheet(game.selected); return; }
            const answerButton = target.closest('[data-cq-answer]');
            if (answerButton && !answerButton.disabled) { answer(Number(answerButton.dataset.cqAnswer)); return; }
            const action = target.closest('[data-cq]');
            if (!action) return;
            const name = action.dataset.cq;
            if (name === 'help') openHelp('zaklady');
            else if (name === 'code') openCode();
            else if (name === 'tempo-custom') { draft.custom = !draft.custom; if (!draft.custom && !C.tempoOf(draft.period, draft.minutes)) Object.assign(draft, { period: C.TEMPOS[0].period, minutes: C.TEMPOS[0].minutes }); saveDraft(); renderHub(); }
            else if (name === 'look') { if (ui.kind === 'lobby') changeLook(); else pickLook({ onDone: () => renderHub() }); }
            else if (name === 'invite-pick') openInvitePicker(ui.kind === 'lobby' ? ui.gameId : null);
            else if (name === 'ready') toggleReady();
            else if (name === 'leave') leaveLobby();
            else if (name === 'share') shareGame(findGame(ui.gameId));
            else if (name === 'hub') openHub('mine');
            else if (name === 'feed' && game) deps.showDialog('Kronika tažení', C.feedHtml(C.feedItems(game.state.moves || [], game.view)));
            else if (name === 'zoom-reset' && game) { game.vb = { x: 0, y: 0, w: game.data.w, h: game.data.h }; applyView(); }
            else if (name === 'sheet-close') closeSheet();
            else if (name === 'attack') startMove('attack', action.dataset.source || game.source);
            else if (name === 'fortify') startMove('fortify');
            else if (name === 'siege-join') joinBattle();
            else if (name === 'siege-resume' && game && game.selected) resumeBattle(game.selected);
            else if (name === 'battle-hide') hideBattle();
            else if (name === 'replay') replay();
            else if (name === 'dev-bot') devAddBots(1);
            else if (name === 'dev-bots-full') { const found = findGame(ui.gameId); if (found) devAddBots(found.max_players - found.players.length); }
            else if (name === 'dev-play') devBotsPlay();
            else if (name === 'dev-period') devNextPeriod();
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
            const battling = game && (game.move ? game.move.battle : game.view.sieges.size > 0);
            const delay = ui.kind === 'game' ? (battlesOn() ? (battling ? POLL_BATTLE : POLL_PULSE) : POLL_GAME) : ui.kind === 'lobby' ? POLL_LOBBY : 30000;
            timer = setTimeout(tick, delay);
        };
        const tick = async () => {
            if (!active()) return;
            if (!doc.hidden) {
                if (ui.kind === 'game' && game && !replaying && battlesOn()) {
                    await pulse();
                    // Pojistka: celý stav aspoň jednou za minutu
                    if (game && !game.move && Date.now() - (game.loadedAt || 0) > 60000) await reloadGame();
                } else if (ui.kind === 'game' && game && !game.move && !replaying) await reloadGame();
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
            if (game && game.move && game.move.battle) {
                // Bitva běží na serveru: otázku nejde zahodit (tah je rezervovaný), čekání jde zavřít
                if (game.move.phase === 'waiting') hideBattle(); else if (game.move.phase === 'question') deps.showToast('Bitva běží: odpověz, než vyprší čas.');
                return true;
            }
            if (game && game.move) { if (game.move.phase === 'sending') return true; clearFx(); game.move = null; closeSheet(); return true; }
            if (replaying && game) { replaying++; setState(game.state); repaintMap(); return true; }
            if (game && sheet() && sheet().innerHTML) { closeSheet(); return true; }
            if (ui.kind === 'game' || ui.kind === 'lobby') { openHub('mine'); return true; }
            clearTimeout(timer);
            return false;
        };
        // Probíhá tah (oslavy z app.js počkají)
        const busy = () => Boolean(game && game.move);

        return { cardHtml, paintCard, refresh, reset, openHub, openGame, openCode, openInvite, afterLogin, takeLink, back, busy, parseCode };
    };

    return { createUI, STORE, LINK_PARAM, PENDING_KEY, parseCode };
});
