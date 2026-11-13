// Profil hráče a výzvy (Supabase REST přes pravidla řádků). Všechno vyžaduje přihlášení (auth.js).
// Výzva = téma (nebo mix), semínko a počet otázek; otázky se z něj losují stejně všem hráčům, takže stačí sdílet kód.
// Otázku sestavenou poprvé si server zapamatuje (zamrzlé otázky, schéma 17), takže ji ostatní dostanou stejnou i po změně dat.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantSocial = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    // Obrázek profilu: emoji a barva (bez nahrávání fotek – bez moderace a bez cizích adres v CSP)
    // Základní obrázky (pro každého); další se odemykají úrovní (MudrlantLook.AVATARS, look.js se načítá až po tomto souboru, proto se čte až při použití)
    const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐵', '🐨', '🐧', '🦋', '🐢', '🐬', '🐝', '🦔', '🐳', '🐰', '🐱', '🐶', '🦦'];
    const lookModule = () => root.MudrlantLook || globalThis.MudrlantLook || null;
    const unlockableAvatars = () => { const look = lookModule(); return look && look.AVATARS ? look.AVATARS.map(item => item.id) : []; };
    const allAvatars = () => [...AVATARS, ...unlockableAvatars().filter(id => !AVATARS.includes(id))];
    // Obrázek k uložení: základní emoji, odměna z katalogu, nebo postavička s barvami částí ('krecek3', přísně podle look.js);
    // staré emoji odměny se zapíše jako postavička, která ho nahradila. Cokoli jiného se neuloží (místo toho základní liška).
    const cleanAvatar = (avatar) => {
        const look = lookModule();
        if (typeof avatar !== 'string') return AVATARS[0];
        if (AVATARS.includes(avatar)) return avatar;
        const code = look && look.avatarCode ? look.avatarCode(avatar) : null;
        if (code) return code;
        return unlockableAvatars().includes(avatar) ? avatar : AVATARS[0];
    };
    const COLORS = ['emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo', 'cerna'];
    const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const COUNTS = [5, 10, 15];
    const NAME_MAX = 24;

    const config = () => root.MUDRLANT_CONFIG || {};
    const baseUrl = () => String(config().supabaseUrl || '').replace(/\/+$/, '');
    const auth = () => root.MudrlantAuth;

    class SocialError extends Error {
        constructor(message, status) { super(message); this.status = status; }
    }

    const request = async (method, path, { body, prefer } = {}, retried = false) => {
        const token = await auth().accessToken(retried);
        if (!token) throw new SocialError('Nejsi přihlášený.', 401);
        const response = await fetch(`${baseUrl()}/rest/v1/${path}`, {
            method,
            headers: { apikey: config().supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        // Server token odmítl (vypršel nebo byl zneplatněn): jednou se obnoví a požadavek se zopakuje
        if (response.status === 401 && !retried) return request(method, path, { body, prefer }, true);
        if (!response.ok) {
            // Zpráva z databáze (např. od kontroly témat výzvy), když ji server pošle
            let detail = '';
            try { detail = String((await response.json()).message || ''); } catch (e) { /* bez těla odpovědi */ }
            throw new SocialError(detail || `Server odpověděl ${response.status}`, response.status);
        }
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    };

    const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    // Přezdívka: 2–24 znaků, písmena (i s diakritikou), číslice, mezera, tečka, podtržítko a pomlčka
    const NAME_PATTERN = /^[\p{L}\p{N} _.\-]{2,24}$/u;
    const isValidName = (name) => NAME_PATTERN.test(cleanName(name));
    const newCode = () => {
        const bytes = new Uint8Array(6);
        (root.crypto || require('node:crypto').webcrypto).getRandomValues(bytes);
        return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
    };
    // Kód z textu nebo z odkazu (…?vyzva=ABC234); malá písmena, mezery a zaměnitelné znaky (0/O, 1/I) se opraví
    const parseCode = (text) => {
        const raw = String(text || '');
        const fromLink = raw.match(/[?&#]vyzva=([A-Za-z0-9]+)/);
        const code = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
        return /^[A-Z0-9]{6}$/.test(code) && [...code].every(char => CODE_ALPHABET.includes(char)) ? code : '';
    };

    // Sloupce frame (rámeček) a title_pref (titul u jména) přibyly pozdější verzí schématu. Dokud je databáze nemá, požadavek s nimi
    // skončí chybou 400 – pak se zopakuje bez nich a dál se už o ně nežádá (po novém načtení stránky se zkusí znovu).
    let extrasMissing = false;
    const withExtras = async (run) => {
        if (!extrasMissing) {
            try { return await run(true); } catch (error) {
                if (error.status !== 400) throw error;
            }
            const result = await run(false);
            extrasMissing = true;
            return result;
        }
        return run(false);
    };
    const profileFields = (extras) => extras ? 'id,display_name,avatar,color,frame,title_pref,owl' : 'id,display_name,avatar,color';
    // Rámeček a titul z cizího řádku: jen tvarově platné hodnoty (znáte-li katalog, jen jeho položky)
    const cleanFrame = (value, known = null) => typeof value === 'string' && /^[a-z0-9-]{1,24}$/.test(value) && (!known || known.includes(value)) ? value : null;
    // Sova jako obrázek: jen tvarově platný text (id z katalogu zkontroluje až vykreslení, MudrlantOwl.parseOwl)
    // Barva pozadí profilovky: jedna z pojmenovaných, nebo vlastní odstín h<stupně> (násobek 5, 0–355) z posuvníku
    const NAMED_HUE = { emerald: 160, sky: 200, violet: 262, rose: 350, amber: 40, teal: 175, orange: 25, indigo: 240 };
    const customHue = (value) => { const m = typeof value === 'string' && /^h(\d{1,3})$/.exec(value); const hue = m ? Number(m[1]) : NaN; return hue >= 0 && hue <= 355 && hue % 5 === 0 ? hue : null; };
    const cleanColor = (value) => COLORS.includes(value) || customHue(value) !== null ? value : COLORS[0];
    // Nejbližší pojmenovaná barva (databáze ze starého schématu vlastní odstíny nepřijme)
    const nearestColor = (value) => {
        const hue = customHue(value);
        if (hue === null) return COLORS.includes(value) ? value : COLORS[0];
        const gap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
        return COLORS.filter(name => NAMED_HUE[name] !== undefined).reduce((best, name) => gap(NAMED_HUE[name], hue) < gap(NAMED_HUE[best], hue) ? name : best, COLORS[0]);
    };
    // Sova titulu (část pose=…) jen titul-1 … titul-11; jiná póza se z textu vynechá, zbytek sovy (oblek, doplňky) platí dál
    const POSE_PART = /^pose=titul-(?:[1-9]|1[01])$/;
    const cleanOwl = (value) => {
        if (typeof value !== 'string' || !/^[a-z0-9=.;-]{1,200}$/.test(value)) return null;
        const text = value.split(';').filter(part => !part.startsWith('pose=') || POSE_PART.test(part)).join(';');
        return text || null;
    };
    const cleanTitlePref = (value) => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value) ? value : null;
    const getProfile = async (userId) => (await withExtras(extras => request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=${profileFields(extras)}`)) || [])[0] || null;
    // Rámeček a titul u jména do účtu; bez nových sloupců v databázi se potichu nic neuloží
    const saveLook = async (userId, { frame, title }) => {
        if (extrasMissing) return false;
        try {
            await request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body: { frame: cleanFrame(frame), title_pref: cleanTitlePref(title) }, prefer: 'return=minimal' });
            return true;
        } catch (error) {
            if (error.status !== 400) throw error;
            extrasMissing = true;
            return false;
        }
    };
    // Jen sova (po změně doplňků nebo barvy obleku se obrázek profilu přeuloží sám); bez sloupce v databázi se potichu nic neuloží
    const saveOwl = async (userId, owl) => {
        if (extrasMissing) return false;
        try {
            await request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body: { owl: cleanOwl(owl) }, prefer: 'return=minimal' });
            return true;
        } catch (error) {
            if (error.status !== 400) throw error;
            extrasMissing = true;
            return false;
        }
    };
    const saveProfile = async (userId, { name, avatar, color, owl }) => {
        const patch = { display_name: cleanName(name), avatar: cleanAvatar(avatar), color: cleanColor(color) };
        // Sova (sloupec owl) je v pozdější verzi schématu: nejdřív s ní, při 400 (sloupec chybí) bez ní; obrázek avatar zůstává jako záloha
        const cleanedOwl = cleanOwl(owl);
        if (cleanedOwl) patch.avatar = AVATARS.includes('🦉') ? '🦉' : patch.avatar;
        if (!isValidName(patch.display_name)) throw new SocialError('Přezdívka má mít 2 až 24 znaků: písmena, číslice, mezeru, tečku, podtržítko nebo pomlčku.', 400);
        const send = (body) => request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body, prefer: 'return=representation' });
        let rows;
        try {
            try {
                rows = await send(extrasMissing ? patch : { ...patch, owl: cleanedOwl });
            } catch (error) {
                if (error.status !== 400) throw error;
                // Starší schéma neumí vlastní odstín barvy: uloží se nejbližší pojmenovaná
                const fallback = { ...patch, color: nearestColor(patch.color) };
                const custom = fallback.color !== patch.color;
                if (extrasMissing) {
                    if (!custom) throw error;
                    rows = await send(fallback);
                } else {
                    // 400 může být i špatná přezdívka: zkusí se bez nových sloupců, a jen když projde, ví se, že sloupec chybí
                    try {
                        rows = await send(patch);
                        extrasMissing = true;
                    } catch (second) {
                        if (second.status !== 400 || !custom) throw second;
                        rows = await send({ ...fallback, owl: cleanedOwl });
                    }
                }
            }
        } catch (error) {
            // Přezdívka je jedinečná: databáze odmítne tu, kterou už někdo má
            if (error.status === 409) throw new SocialError('Tuhle přezdívku už má jiný hráč.', 409);
            throw error;
        }
        return rows && rows[0] ? rows[0] : { id: userId, ...patch, owl: extrasMissing ? null : cleanedOwl };
    };

    // Založí výzvu a vrátí ji (kód vybírá klient; při srážce s existujícím kódem zkusí jiný)
    // Obtížnost: level 1 Základní, 2 Mudrlant, 3 Mudrlant Expert (sloupec level od schématu 16; include_hard = aspoň Mudrlant
    // pro starší klienty). Bez sloupce level (starší databáze) se Expert založí jako Mudrlant.
    let levelMissing = false;
    // Konec semínka nové výzvy: výzva smí mít otázky „Ukaž na mapě“ (question-map.js MULTIPLAYER_SEED_MARK); výzvy starších verzí aplikace
    // ho nemají a zůstanou bez mapy na všech zařízeních
    const CHALLENGE_SEED_MARK = '.mapa';
    const createChallenge = async (userId, { topic, count, invitedId = null, includeHard = false, level = null, categories = [], variant = null }) => {
        if (!COUNTS.includes(count)) throw new SocialError('Neplatný počet otázek.', 400);
        const wanted = [1, 2, 3].includes(level) ? level : includeHard ? 2 : 1;
        for (let attempt = 0; attempt < 4; attempt++) {
            const id = newCode();
            const body = { id, creator_id: userId, topic, seed: `vyzva-${id}-${Date.now().toString(36)}${CHALLENGE_SEED_MARK}`, count, invited_id: invitedId, include_hard: wanted >= 2, categories: (categories || []).slice(0, 20), variant: variant === 'typed' || variant === 'choices' ? variant : null };
            try {
                const rows = await request('POST', 'challenges', { body: wanted === 3 && !levelMissing ? { ...body, level: 3 } : body, prefer: 'return=representation' });
                return rows[0];
            } catch (error) {
                if (error.status === 400 && wanted === 3 && !levelMissing) { levelMissing = true; attempt--; continue; }
                if (error.status !== 409) throw error;
            }
        }
        throw new SocialError('Výzvu se nepodařilo založit.', 409);
    };
    const getChallenge = async (code) => {
        const run = async () => (await withExtras(extras => request('GET', `challenges?id=eq.${encodeURIComponent(code)}&select=id,topic,seed,count,created_at,include_hard,${levelMissing ? '' : 'level,'}categories,variant,creator:profiles!creator_id(${profileFields(extras)}),invited:profiles!invited_id(${profileFields(extras)})`)) || [])[0] || null;
        try { return await run(); } catch (error) {
            // Databáze bez sloupce level (před schématem 16): výzva bez úrovně Expert
            if (error.status !== 400 || levelMissing) throw error;
            levelMissing = true;
            return run();
        }
    };
    // Pořadí ve výzvě: víc bodů, při shodě víc správných (stejně jako MudrlantRating.compareResults a databáze)
    const compareResults = (a, b) => ((Number(a.points) || 0) - (Number(b.points) || 0)) || ((Number(a.correct) || 0) - (Number(b.correct) || 0));
    // Výsledky hráčů ve výzvě, nejlepší první (víc bodů, pak víc správných, pak dřív hotové)
    const getResults = async (code) => {
        const rows = await withExtras(extras => request('GET', `challenge_results?challenge_id=eq.${encodeURIComponent(code)}&select=correct,points,finished_at,user_id,player:profiles!user_id(${profileFields(extras)})`)) || [];
        return rows.sort((a, b) => compareResults(b, a) || String(a.finished_at).localeCompare(String(b.finished_at)));
    };
    // První výsledek platí (ignoruje se opakovaný zápis), ať si nejde skóre vylepšit hraním znovu
    // Celé číslo v rozsahu 0..max (NaN, záporné a nesmyslně velké hodnoty by databáze stejně odmítla a výsledek by se ztratil)
    const wholeNumber = (value, max) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0;
    const submitResult = (userId, code, { correct, points }) => request('POST', 'challenge_results?on_conflict=challenge_id,user_id', {
        body: { challenge_id: code, user_id: userId, correct: wholeNumber(correct, 20), points: wholeNumber(points, 80) }, prefer: 'resolution=ignore-duplicates,return=minimal'
    });
    // Moje výzvy, nejnovější první, s mým výsledkem a výsledky ostatních
    // before = finished_at nejstarší už načtené výzvy: další (starší) stránka pro nekonečný seznam Posledních výzev
    const myChallenges = async (userId, limit = 8, before = null) => {
        const older = before && !Number.isNaN(Date.parse(before)) ? `&finished_at=lt.${encodeURIComponent(new Date(before).toISOString())}` : '';
        const mine = await withExtras(extras => request('GET', `challenge_results?user_id=eq.${encodeURIComponent(userId)}${older}&select=challenge_id,correct,points,finished_at,challenge:challenges(id,topic,count,creator:profiles!creator_id(${profileFields(extras)}))&order=finished_at.desc&limit=${Math.max(1, Math.min(50, wholeNumber(limit, 50)))}`)) || [];
        if (!mine.length) return [];
        const ids = mine.map(row => row.challenge_id).join(',');
        const others = await withExtras(extras => request('GET', `challenge_results?challenge_id=in.(${ids})&user_id=neq.${encodeURIComponent(userId)}&select=challenge_id,correct,points,player:profiles!user_id(${profileFields(extras)})`)) || [];
        return mine.map(row => ({ ...row, others: others.filter(other => other.challenge_id === row.challenge_id) }));
    };

    // Úroveň (XP) a odznaky v účtu; sloupce přibyly pozdější verzí schématu, bez nich volající chybu ignoruje
    // Kamarádské sázky (schéma 21): se XP i součty vyhraných a prohraných XP ze sázek (bet_won, bet_lost), ať je zařízení sladí ve stejném
    // okamžiku jako XP (bets.js reconcile); databáze bez nich odpoví 400 a dál se o ně nežádá
    let betTotalsMissing = false;
    const getProgress = async (userId) => {
        const run = () => withExtras(extras => request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=xp,badges${extras ? ',title_pref' : ''}${betTotalsMissing ? '' : ',bet_won,bet_lost'}`));
        try { return ((await run()) || [])[0] || null; } catch (error) {
            if (error.status !== 400 || betTotalsMissing) throw error;
            betTotalsMissing = true;
            return ((await run()) || [])[0] || null;
        }
    };
    const saveProgress = (userId, { xp, badges }) => request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, {
        body: { xp: wholeNumber(xp, 500000), badges: badges.filter(id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id)).slice(0, 200) }, prefer: 'return=minimal'
    });

    // Rating (ELO) a týdenní žebříček: sloupec a funkce přibyly pozdější verzí schématu. Dokud je databáze nemá (404/400),
    // vrací se prázdný výsledek a dál se o ně nežádá (po novém načtení stránky se zkusí znovu); jiné chyby (síť) se vyhodí.
    let ratingMissing = false;
    const guardRating = async (run, empty) => {
        if (ratingMissing) return empty;
        try { return await run(); } catch (error) {
            if (error.status === 400 || error.status === 404) { ratingMissing = true; return empty; }
            throw error;
        }
    };
    const cleanRatingNumber = (value) => Number.isFinite(Number(value)) ? Math.max(100, Math.min(5000, Math.floor(Number(value)))) : null;
    // Rating a počet ohodnocených výzev hráče; null, když rating v databázi ještě není
    const getRating = (userId) => guardRating(async () => {
        const row = (await request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=rating,rated_games`) || [])[0];
        const rating = row ? cleanRatingNumber(row.rating) : null;
        return rating === null ? null : { rating, games: Math.max(0, Math.floor(Number(row.rated_games) || 0)) };
    }, null);
    // Změna ratingu hráče po výzvě (zapsal ji server po dohrání obou hráčů); null = výzva se nehodnotila (sám, třetí hráč…)
    const getRatingChange = (userId, code) => guardRating(async () => {
        const row = (await request('GET', `rating_history?challenge_id=eq.${encodeURIComponent(code)}&user_id=eq.${encodeURIComponent(userId)}&select=delta,rating_after,outcome,capped`) || [])[0];
        return row ? { delta: Math.floor(Number(row.delta) || 0), after: cleanRatingNumber(row.rating_after), outcome: row.outcome, capped: Boolean(row.capped) } : null;
    }, null);
    // Top hráči aktuálního týdne (veřejné údaje); null, když funkce v databázi ještě není
    const weeklyLeaderboard = () => guardRating(async () => {
        const rows = await request('POST', 'rpc/weekly_leaderboard', { body: {} }) || [];
        return rows.map(row => ({ ...row, frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl), rating: cleanRatingNumber(row.rating) || 1000, week_delta: Math.floor(Number(row.week_delta) || 0), week_wins: Math.floor(Number(row.week_wins) || 0), week_games: Math.floor(Number(row.week_games) || 0) }));
    }, null);

    // Týdenní turnaje (tabulky a funkce přibyly pozdější verzí schématu). Dokud je databáze nemá (404), vracejí se prázdné výsledky
    // (karta turnaje se neukáže) a dál se o ně nežádá (po novém načtení stránky se zkusí znovu); jiné chyby (síť) se vyhodí.
    let tournamentsMissing = false;
    const guardTournaments = async (run, empty) => {
        if (tournamentsMissing) return empty;
        try { return await run(); } catch (error) {
            if (error.status === 404) { tournamentsMissing = true; return empty; }
            throw error;
        }
    };
    const isTournamentId = (value) => typeof value === 'string' && /^[0-9a-fA-F-]{32,36}$/.test(value);
    const needTournamentId = (value, what = 'turnaj') => { if (!isTournamentId(value)) throw new SocialError(`Neplatný ${what}.`, 400); return value; };
    // Hlášky serveru jsou česky; cokoli jiného (síť, 500, anglická hláška databáze) se nahradí srozumitelným textem
    const CZECH_MESSAGE = /[ěščřžýáíéúůďťňĚŠČŘŽÝÁÍÉÚŮĎŤŇ]|^(Kolo|Turnaj|Zápas)\b/;
    const tournamentCall = async (name, body, fallback) => {
        if (tournamentsMissing) throw new SocialError('Turnaje zatím nejsou k dispozici.', 404);
        try {
            return await request('POST', `rpc/${name}`, { body });
        } catch (error) {
            if (error instanceof SocialError && error.status === 404) { tournamentsMissing = true; throw new SocialError('Turnaje zatím nejsou k dispozici.', 404); }
            if (error instanceof SocialError && error.status === 401) throw new SocialError('Nejsi přihlášený.', 401);
            if (error instanceof SocialError && error.status < 500 && CZECH_MESSAGE.test(error.message)) throw error;
            throw new SocialError(fallback, error && error.status);
        }
    };
    const wholeOrNull = (value) => { const number = Math.floor(Number(value)); return Number.isFinite(number) ? number : null; };
    const cleanTournament = (row) => ({
        id: String(row.id), topic: String(row.topic || 'mix'), week_start: String(row.week_start || '').slice(0, 10), started_on: row.started_on ? String(row.started_on).slice(0, 10) : null,
        capacity: wholeOrNull(row.capacity) || 128, status: ['open', 'running', 'finished', 'cancelled'].includes(row.status) ? row.status : 'finished',
        size: wholeOrNull(row.size), rounds: wholeOrNull(row.rounds), seed: String(row.seed || '')
    });
    // Posune turnaje (přihlášky na příští týden, start v pondělí, další kolo); true, když turnaje v databázi jsou, jinak null
    const tournamentTick = () => guardTournaments(async () => { await request('POST', 'rpc/tournament_tick', { body: {} }); return true; }, null);
    // Otevřené, běžící a poslední skončené turnaje, nejnovější první; null = databáze turnaje nemá
    const getTournaments = () => guardTournaments(async () => {
        const rows = await request('GET', 'tournaments?status=in.(open,running,finished)&order=week_start.desc&limit=6&select=id,topic,week_start,started_on,capacity,status,size,rounds,seed') || [];
        return rows.map(cleanTournament);
    }, null);
    // Archiv turnajů: skončené turnaje od nejnovějšího po stránkách (offset, limit nejvýš 20; zrušené se nehrály, v archivu nejsou). Ke každému
    // vítěz (přihláška s 1. místem; kde místa chybí, vítěz finále) a moje přihláška (místo, stav). Jen čtení přes pravidla řádků, bez funkce
    // v databázi: [{ tournament, winner: { user_id, player } | null, mine: { place, status } | null }]; null = databáze turnaje nemá
    const ARCHIVE_PAGE = 10;
    const tournamentArchive = (userId, offset = 0, limit = ARCHIVE_PAGE) => guardTournaments(async () => {
        const count = Math.max(1, Math.min(20, wholeOrNull(limit) || ARCHIVE_PAGE));
        const from = Math.max(0, wholeOrNull(offset) || 0);
        const rows = await request('GET', `tournaments?status=eq.finished&order=week_start.desc,id.desc&limit=${count}&offset=${from}&select=id,topic,week_start,started_on,capacity,status,size,rounds,seed`) || [];
        const list = rows.filter(row => row && isTournamentId(row.id)).map(cleanTournament);
        if (!list.length) return [];
        const ids = list.map(item => item.id).join(',');
        const me = encodeURIComponent(String(userId || ''));
        const entries = await withExtras(extras => request('GET', `tournament_entries?tournament_id=in.(${ids})&or=(place.eq.1,user_id.eq.${me})&limit=${count * 4}&select=tournament_id,user_id,status,place,player:profiles!user_id(${profileFields(extras)})`)) || [];
        const of = (tid) => entries.filter(row => row && row.tournament_id === tid);
        return Promise.all(list.map(async (tournament) => {
            const own = of(tournament.id).find(row => row.user_id === userId) || null;
            let winner = of(tournament.id).find(row => wholeOrNull(row.place) === 1) || null;
            // Místa nevyplněná (starší data): vítěz finále
            if (!winner && tournament.rounds) {
                const finals = await withExtras(extras => request('GET', `tournament_matches?tournament_id=eq.${encodeURIComponent(tournament.id)}&round=eq.${tournament.rounds}&third=is.false&limit=1&select=winner,player:profiles!winner(${profileFields(extras)})`)).catch(() => []) || [];
                const final = finals[0];
                if (final && final.winner) winner = { user_id: String(final.winner), player: final.player || null };
            }
            return {
                tournament,
                winner: winner ? { user_id: String(winner.user_id), player: winner.player || null } : null,
                mine: own ? { place: wholeOrNull(own.place), status: String(own.status || '') } : null
            };
        }));
    }, null);
    // Přihlášky s profilem hráče, v pořadí přihlášení
    const getTournamentEntries = (tid) => guardTournaments(async () => {
        const rows = await withExtras(extras => request('GET', `tournament_entries?tournament_id=eq.${encodeURIComponent(needTournamentId(tid))}&order=joined_at.asc&limit=300&select=user_id,joined_at,status,place,player:profiles!user_id(${profileFields(extras)})`)) || [];
        return rows.map(row => ({ ...row, place: wholeOrNull(row.place) }));
    }, []);
    // Jsem přihlášený do turnaje? (levný dotaz na jeden řádek; null = databáze turnaje nemá)
    const inTournament = (tid, userId) => guardTournaments(async () => {
        const rows = await request('GET', `tournament_entries?tournament_id=eq.${encodeURIComponent(needTournamentId(tid))}&user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`);
        return Array.isArray(rows) && rows.length > 0;
    }, null);
    // Zápasy turnaje s výsledky (cizí výsledek ukáže server až po rozhodnutí zápasu)
    const getTournamentMatches = (tid) => guardTournaments(async () => {
        const rows = await request('GET', `tournament_matches?tournament_id=eq.${encodeURIComponent(needTournamentId(tid))}&order=round.asc,slot.asc&limit=300&select=id,round,slot,third,p1,p2,winner,decided_by,results:tournament_results(user_id,started_at,finished_at,correct,points,time_ms)`) || [];
        return rows.map(row => ({ ...row, third: Boolean(row.third), results: Array.isArray(row.results) ? row.results : [] }));
    }, []);
    const joinTournament = (tid) => tournamentCall('tournament_join', { tid: needTournamentId(tid) }, 'Přihlášení se nepodařilo. Zkus to znovu.');
    const leaveTournament = (tid) => tournamentCall('tournament_leave', { tid: needTournamentId(tid) }, 'Odhlášení se nepodařilo. Zkus to znovu.');
    // Server od teď měří čas zápasu; až po úspěchu se smí hrát
    const startTournamentMatch = (mid) => tournamentCall('tournament_start_match', { mid: needTournamentId(mid, 'zápas') }, 'Zápas se nepodařilo zahájit. Zkontroluj připojení a zkus to znovu.');
    const finishTournamentMatch = (mid, correct, points) => tournamentCall('tournament_finish_match', { mid: needTournamentId(mid, 'zápas'), correct_count: wholeNumber(correct, 10), point_count: wholeNumber(points, 100) }, 'Výsledek se nepodařilo odeslat. Zkontroluj připojení.');

    // Průběh výzvy a zápasu turnaje na serveru (schéma 3): odpovědi po otázkách v pořadí, ať rozehranou výzvu nejde po smazání dat hrát znovu
    // od první otázky a dohrát jde i na jiném zařízení. Starší databáze bez tabulek a funkcí (404): načtení vrací null a uložení null
    // (aplikace se pak chová jako dřív) a dál se o ně nežádá; chyba spojení se vyhodí, odmítnutí serverem (4xx) také (s hláškou serveru).
    const answersMissing = { challenge: false, tournament: false };
    const guardAnswers = async (kind, run) => {
        if (answersMissing[kind]) return null;
        try { return await run(); } catch (error) {
            if (error.status === 404) { answersMissing[kind] = true; return null; }
            throw error;
        }
    };
    // Podrobnosti odpovědi do Rozpisu otázek (schéma 10): text odpovědi (nejvýš 120 znaků, bez řídicích a neviditelných znaků), nápovědy 0–4
    // a čas v ms (nejvýš hodina); co chybí nebo nedává smysl, je null
    const ANSWER_MAX = 120;
    // eslint-disable-next-line no-control-regex
    const HIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]/g;
    const cleanAnswerLabel = (value) => {
        if (typeof value !== 'string') return null;
        const text = value.replace(HIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim();
        return text ? Array.from(text).slice(0, ANSWER_MAX).join('').trim() : null;
    };
    const optionalWhole = (value, max) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Math.min(max, Math.floor(Number(value))));
    const cleanDetails = (row) => ({ answer: cleanAnswerLabel(row && row.answer), hints: optionalWhole(row && row.hints, 4), ms: optionalWhole(row && row.ms, 3600000) });
    // Jen souvislá řada odpovědí od první otázky (server jinou neuloží): [{ correct, points, answer, hints, ms }]
    const cleanAnswers = (rows, count, maxPoints) => {
        const list = [];
        (Array.isArray(rows) ? rows : []).map(row => ({ idx: Math.floor(Number(row && row.idx)), correct: Boolean(row && row.correct), points: wholeNumber(row && row.points, maxPoints), ...cleanDetails(row) }))
            .sort((a, b) => a.idx - b.idx)
            .forEach(row => { if (row.idx === list.length && list.length < count) list.push({ correct: row.correct && row.points > 0, points: row.correct ? row.points : 0, answer: row.answer, hints: row.hints, ms: row.ms }); });
        return list;
    };
    // Databáze bez podrobností (schéma starší než 10): sloupce chybí (400) a funkce s nimi neexistuje (404). Pak se načítá a ukládá jen
    // správně a body jako dřív a o podrobnosti se dál nežádá (po novém načtení stránky se zkusí znovu).
    let detailsMissing = false;
    const withDetails = async (run) => {
        if (!detailsMissing) {
            try { return await run(true); } catch (error) {
                if (error.status !== 400 && error.status !== 404) throw error;
            }
            const result = await run(false);
            detailsMissing = true;
            return result;
        }
        return run(false);
    };
    const answerColumns = (details) => `idx,correct,points${details ? ',answer,hints,ms' : ''}`;
    const answerBody = (base, row, details) => {
        if (!details) return base;
        const extra = cleanDetails(row);
        return { ...base, answer: extra.answer, hints: extra.hints, ms: extra.ms };
    };
    // Kód výzvy tak, jak ho drží databáze (šest znaků A–Z a 0–9)
    const needCode = (code) => { const clean = String(code || ''); if (!/^[A-Z0-9]{6}$/.test(clean)) throw new SocialError('Neplatný kód výzvy.', 400); return clean; };
    const challengeProgress = (userId, code, count = 20) => guardAnswers('challenge', async () => cleanAnswers(await withDetails(details =>
        request('GET', `challenge_progress?challenge_id=eq.${needCode(code)}&user_id=eq.${encodeURIComponent(userId)}&select=${answerColumns(details)}&order=idx.asc&limit=20`)), count, 8));
    // true = uloženo (nebo server stejnou odpověď už měl), null = databáze průběh neeviduje; správná odpověď má vždy aspoň bod (jinak by ji server odmítl)
    const saveChallengeProgress = (code, idx, row) => guardAnswers('challenge', async () => {
        const { correct, points } = row || {};
        const base = { code: needCode(code), idx: wholeNumber(idx, 19), correct: Boolean(correct), points: correct ? Math.max(1, wholeNumber(points, 8)) : 0 };
        await withDetails(details => request('POST', 'rpc/challenge_progress_save', { body: answerBody(base, row, details) }));
        return true;
    });
    const tournamentAnswers = (userId, mid) => guardAnswers('tournament', async () => cleanAnswers(await withDetails(details =>
        request('GET', `tournament_answers?match_id=eq.${encodeURIComponent(needTournamentId(mid, 'zápas'))}&user_id=eq.${encodeURIComponent(userId)}&select=${answerColumns(details)}&order=idx.asc&limit=10`)), 10, 4));
    const saveTournamentAnswer = (mid, idx, row) => guardAnswers('tournament', async () => {
        const { correct, points } = row || {};
        const base = { mid: needTournamentId(mid, 'zápas'), idx: wholeNumber(idx, 9), correct: Boolean(correct), points: correct ? Math.max(1, wholeNumber(points, 4)) : 0 };
        await withDetails(details => request('POST', 'rpc/tournament_answer_save', { body: answerBody(base, row, details) }));
        return true;
    });
    // Rozpis otázek po dohrání (schéma 10): odpovědi hráčů po otázkách { [userId]: [{ correct, points, answer, hints, ms } | null, …] }.
    // Cizí odpovědi server vrátí, až když volající sám dohrál (výzvu: i soupeř ji dohrál nebo vypršela; zápas: dohráli oba nebo je rozhodnutý).
    // null = databáze rozpis nemá (starší schéma); odmítnutí (403, ještě nedohráno) a chyba spojení se vyhodí.
    const cleanBreakdown = (rows, count, maxPoints) => {
        const players = {};
        (Array.isArray(rows) ? rows : []).forEach(row => {
            const userId = row && typeof row.user_id === 'string' && /^[0-9a-fA-F-]{32,36}$/.test(row.user_id) ? row.user_id : null;
            const idx = Math.floor(Number(row && row.idx));
            if (!userId || !(idx >= 0 && idx < count)) return;
            if (!players[userId]) players[userId] = Array.from({ length: count }, () => null);
            const points = wholeNumber(row.points, maxPoints);
            const correct = Boolean(row.correct) && points > 0;
            players[userId][idx] = { correct, points: correct ? points : 0, ...cleanDetails(row) };
        });
        return players;
    };
    const breakdownCall = async (fn, body, count, maxPoints) => {
        try {
            return cleanBreakdown(await request('POST', `rpc/${fn}`, { body }), count, maxPoints);
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    };
    const challengeDetails = (code, count = 20) => breakdownCall('challenge_details', { code: needCode(code) }, Math.max(1, wholeNumber(count, 20)), 8);
    const tournamentDetails = (mid) => breakdownCall('tournament_details', { mid: needTournamentId(mid, 'zápas') }, 10, 4);
    // Zamrzlé otázky (schéma 17): otázka výzvy, zápasu turnaje a Kvízu dne se při prvním sestavení uloží na server a platí pro všechny hráče,
    // i když mají jinou verzi dat. claimQuestion(seed, data) ji uloží (když pro semínko ještě žádná není) a vrátí tu uloženou (první zápis platí);
    // questionSnapshots(seeds) vrátí uložené otázky k semínkům ({ [semínko]: data }, chybějící semínka v něm nejsou). Databáze bez nich (404):
    // null a dál se o ně nežádá (aplikace pak otázky skládá jen v zařízení jako dřív); chyba spojení a odmítnutí serverem (4xx) se vyhodí.
    let snapshotsMissing = false;
    const SNAPSHOT_SEED = /^[A-Za-z0-9._:-]{1,200}$/;
    const isSnapshotSeed = (value) => typeof value === 'string' && SNAPSHOT_SEED.test(value);
    const isSnapshotData = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const guardSnapshots = async (run) => {
        if (snapshotsMissing) return null;
        try { return await run(); } catch (error) {
            if (error.status === 404) { snapshotsMissing = true; return null; }
            throw error;
        }
    };
    const claimQuestion = (seed, data) => {
        if (!isSnapshotSeed(seed) || !isSnapshotData(data)) return Promise.reject(new SocialError('Neplatná otázka.', 400));
        return guardSnapshots(async () => {
            const stored = await request('POST', 'rpc/question_snapshot_claim', { body: { seed, data } });
            return isSnapshotData(stored) ? stored : null;
        });
    };
    const questionSnapshots = (seeds) => guardSnapshots(async () => {
        const list = [...new Set((Array.isArray(seeds) ? seeds : []).filter(isSnapshotSeed))].slice(0, 200);
        const found = Object.create(null);
        if (!list.length) return found;
        const rows = await request('POST', 'rpc/question_snapshots_get', { body: { seeds: list } });
        (Array.isArray(rows) ? rows : []).forEach(row => { if (row && list.includes(row.seed) && isSnapshotData(row.data)) found[row.seed] = row.data; });
        return found;
    });
    // XP za vyhrané zápasy turnaje (schéma 3): server zapíše dosud nevyplacené výhry a vrátí je ([{ id, round }]); retryKey = klíč zařízení,
    // se kterým opakované volání (ztracená odpověď) vrátí tytéž zápasy znovu. null = databáze vyplácení neeviduje (starší schéma).
    let claimMissing = false;
    const claimTournamentXp = async (retryKey) => {
        if (claimMissing || tournamentsMissing) return null;
        try {
            const rows = await request('POST', 'rpc/claim_tournament_xp', { body: { retry_key: /^[A-Za-z0-9_-]{8,64}$/.test(String(retryKey || '')) ? retryKey : null } });
            if (!Array.isArray(rows)) return null;
            return rows.filter(row => row && isTournamentId(row.id)).map(row => ({ id: String(row.id), round: Math.max(1, wholeNumber(row.round, 20)) }));
        } catch (error) {
            if (error.status === 404) { claimMissing = true; return null; }
            throw error;
        }
    };
    // Vývojářské nástroje turnajů (boti): jen pro účet zapsaný v dev_admins; chyba serveru se předá tak, jak je
    const devTournament = async (name, body = {}) => {
        const allowed = ['dev_tournament_add_bots', 'dev_tournament_start_now', 'dev_tournament_next_round', 'dev_tournament_bots_play', 'dev_tournament_clear_bots', 'dev_tournament_reset'];
        if (!allowed.includes(name)) throw new SocialError('Neznámý nástroj.', 400);
        try { return await request('POST', `rpc/${name}`, { body }); } catch (error) {
            if (error.status === 404) throw new SocialError('Vývojářské nástroje turnajů v databázi chybí: spusť znovu supabase/schema.sql.', 404);
            if (error.status === 401 || error.status === 403 || /dev_admins/.test(String(error.message))) throw new SocialError('Tenhle účet není v dev_admins (návod v docs/SUPABASE.md).', 403);
            throw error;
        }
    };
    // Chyby z provozu (monitor.js → tabulka client_errors): posledních 50 seskupených podle otisku; jen pro účet v dev_admins
    const devClientErrors = async () => {
        try { return (await request('POST', 'rpc/dev_client_errors', { body: {} })) || []; } catch (error) {
            if (error.status === 404) throw new SocialError('Sběr chyb v databázi chybí: spusť znovu supabase/schema.sql.', 404);
            if (error.status === 401 || error.status === 403 || /dev_admins/.test(String(error.message))) throw new SocialError('Tenhle účet není v dev_admins (návod v docs/SUPABASE.md).', 403);
            throw error;
        }
    };
    // Je přihlášený hráč správce (dev_admins)? Starší databáze bez funkce: false
    const isDevAdmin = async () => {
        try { return (await request('POST', 'rpc/dev_is_admin', { body: {} })) === true; } catch (error) {
            if (error.status === 404) return false;
            throw error;
        }
    };
    // Verze schématu v databázi (schema_version() na konci supabase/schema.sql); null = databáze funkci nemá (schéma je starší než verze 1),
    // undefined = odpověď nejde přečíst (nic se nehlásí)
    const schemaVersion = async () => {
        try {
            const value = Math.floor(Number(await request('POST', 'rpc/schema_version', { body: {} })));
            return Number.isFinite(value) ? value : undefined;
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    };
    // Moje turnajové údaje do odznaků: { best, wins, played }; null, když turnaje v databázi nejsou
    const myTournamentStats = () => guardTournaments(async () => {
        const result = await request('POST', 'rpc/my_tournament_stats', { body: {} });
        const row = Array.isArray(result) ? result[0] : result;
        return row ? { best: wholeNumber(row.best, 6), wins: wholeNumber(row.wins, 100000), played: wholeNumber(row.played, 100000) } : { best: 0, wins: 0, played: 0 };
    }, null);
    // Nepřečtené zprávy o turnajích (nejstarší první)
    const tournamentNotices = (userId) => guardTournaments(async () => {
        const rows = await request('GET', `tournament_notices?user_id=eq.${encodeURIComponent(userId)}&seen=eq.false&order=created_at.asc,id.asc&limit=20&select=id,tournament_id,kind,detail,created_at`) || [];
        return rows.filter(row => Number.isFinite(Number(row.id)));
    }, []);
    const tournamentNoticesSeen = (ids) => guardTournaments(async () => {
        const clean = ids.map(Number).filter(Number.isFinite);
        if (clean.length) await request('POST', 'rpc/tournament_notices_seen', { body: { ids: clean } });
    }, undefined);

    // Profil hráče pro cizí oči: počet her, úspěšnost, nejlepší výsledek a (u cizího hráče) vzájemná bilance s přihlášeným
    // a nastavení poslední společné výzvy, ať jde snadno vyzvat k odvetě. Vše se počítá z uložených výsledků výzev.
    const playerStats = async (meId, otherId) => {
        const theirs = await request('GET', `challenge_results?user_id=eq.${encodeURIComponent(otherId)}&select=challenge_id,correct,points,challenge:challenges(id,count)&order=finished_at.desc&limit=100`) || [];
        const answered = theirs.reduce((sum, row) => sum + (row.challenge ? row.challenge.count : 0), 0);
        const correct = theirs.reduce((sum, row) => sum + row.correct, 0);
        const best = theirs.reduce((top, row) => {
            const count = row.challenge ? row.challenge.count : 0;
            return count && (!top || row.correct / count > top.correct / top.count) ? { correct: row.correct, count } : top;
        }, null);
        const stats = { games: theirs.length, correct, answered, best, versus: null, last: null };
        if (meId === otherId || !theirs.length) return stats;
        const ids = theirs.map(row => row.challenge_id).join(',');
        const mine = await request('GET', `challenge_results?user_id=eq.${encodeURIComponent(meId)}&challenge_id=in.(${ids})&select=challenge_id,correct,points`) || [];
        const mineById = new Map(mine.map(row => [row.challenge_id, row]));
        const versus = { wins: 0, losses: 0, draws: 0 };
        for (const row of theirs) {
            const own = mineById.get(row.challenge_id);
            if (!own) continue;
            const diff = compareResults(own, row);
            if (diff > 0) versus.wins++; else if (diff < 0) versus.losses++; else versus.draws++;
        }
        stats.versus = versus;
        if (mine.length) {
            const shared = await request('GET', `challenges?id=in.(${mine.map(row => row.challenge_id).join(',')})&select=id,topic,count,include_hard,categories,variant&order=created_at.desc&limit=1`) || [];
            stats.last = shared[0] || null;
        }
        return stats;
    };

    // Hledání hráčů podle přezdívky (část jména, na velikosti písmen nezáleží), bez mě a bez blokovaných (funkce search_players v databázi;
    // starší databáze bez ní hledá přímo v profilech)
    let searchRpcMissing = false;
    const searchPlayers = async (userId, query) => {
        const term = String(query || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, NAME_MAX);
        if (term.length < 2) return [];
        if (!searchRpcMissing) {
            try {
                const rows = await request('POST', 'rpc/search_players', { body: { term } });
                return (Array.isArray(rows) ? rows : []).map(row => ({ id: row.id, display_name: row.display_name, avatar: row.avatar, color: row.color, frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl) }));
            } catch (error) {
                if (error.status !== 404) throw error;
                searchRpcMissing = true;
            }
        }
        return await withExtras(extras => request('GET', `profiles?display_name=ilike.${encodeURIComponent(`*${term}*`)}&id=neq.${encodeURIComponent(userId)}&select=${profileFields(extras)}&order=display_name&limit=8`)) || [];
    };
    // Náhodný jiný hráč (funkce v databázi); null, když tu zatím nikdo další není
    // wanted = témata výzvy (hráč, který je nepřijímá, se přeskočí), wantsMix = výzva je Mix (přeskočí hráče bez Mixu);
    // starší databáze bez parametrů volá funkci s menší výbavou
    const randomOpponent = async (wanted = [], wantsMix = false) => {
        const attempts = [{ wanted, wants_mix: wantsMix }, { wanted }, {}];
        let rows;
        for (let i = 0; i < attempts.length; i++) {
            try {
                rows = await request('POST', 'rpc/random_opponent', { body: attempts[i] });
                break;
            } catch (error) {
                if ((error.status !== 404 && error.status !== 400) || i === attempts.length - 1) throw error;
            }
        }
        return (rows || [])[0] || null;
    };
    // Co hráč přijímá: témata, ze kterých výzvy nepřijímá, a zda přijímá Mix všech témat; bez sloupců (starší schéma) přijímá vše
    const getAccepts = async (userId) => {
        try {
            const row = (await request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=blocked_topics,accepts_mix`) || [])[0];
            return { blocked: row && Array.isArray(row.blocked_topics) ? row.blocked_topics : [], mix: !row || row.accepts_mix !== false };
        } catch (error) {
            return { blocked: [], mix: true };
        }
    };
    const saveAccepts = (userId, { blocked, mix }) => request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body: { blocked_topics: [...new Set(blocked)].slice(0, 30), accepts_mix: Boolean(mix) }, prefer: 'return=minimal' });
    // Výzvy pro mě, které jsem ještě nehrál, nejnovější první
    const incomingChallenges = async (userId, limit = 10) => {
        const invites = await withExtras(extras => request('GET', `challenges?invited_id=eq.${encodeURIComponent(userId)}&select=id,topic,count,created_at,creator:profiles!creator_id(${profileFields(extras)})&order=created_at.desc&limit=${limit}`)) || [];
        if (!invites.length) return [];
        const ids = invites.map(row => row.id).join(',');
        const played = await request('GET', `challenge_results?user_id=eq.${encodeURIComponent(userId)}&challenge_id=in.(${ids})&select=challenge_id`) || [];
        const done = new Set(played.map(row => row.challenge_id));
        return invites.filter(row => !done.has(row.id));
    };

    // Hlášení chyb v otázkách: hráč pošle vlastní (databáze hlídá délku a denní limit), čtou a mažou je jen dev_admins
    const reportQuestion = (userId, report) => request('POST', 'question_reports', { body: { ...report, user_id: userId }, prefer: 'return=minimal' });
    const getQuestionReports = async (limit = 100) => {
        try {
            return await request('GET', `question_reports?select=id,user_id,topic,item_id,question_type,reason,note,title,answer,created_at,author:profiles!user_id(display_name)&order=created_at.desc&limit=${Math.max(1, Math.min(200, Number(limit) || 100))}`) || [];
        } catch (error) {
            if (error.status === 404) throw new SocialError('Hlášení otázek v databázi chybí: spusť znovu supabase/schema.sql.', 404);
            throw error;
        }
    };
    const deleteQuestionReport = (id) => request('DELETE', `question_reports?id=eq.${encodeURIComponent(Number(id))}`);

    // Moje data: export všeho, co o hráči leží na serveru (JSON), a smazání účtu (profil i přihlašovací záznam).
    // Hlášky serveru jsou česky (turnaj); chybějící funkce (schema.sql ještě nespuštěno) dostane srozumitelný text.
    const accountCall = async (name, fallback) => {
        try {
            return await request('POST', `rpc/${name}`, { body: {} });
        } catch (error) {
            if (error instanceof SocialError && error.status === 404) throw new SocialError('Tato funkce na serveru zatím není zapnutá. Napiš provozovateli (kontakt v Zásadách ochrany osobních údajů).', 404);
            if (error instanceof SocialError && error.status === 401) throw new SocialError('Nejsi přihlášený.', 401);
            if (error instanceof SocialError && error.status < 500 && /hraješ turnaj/.test(error.message)) throw error;
            throw new SocialError(fallback, error && error.status);
        }
    };
    const exportMyData = () => accountCall('export_my_data', 'Data se nepodařilo stáhnout, zkus to znovu.');
    // true = smazáno úplně; false = data smazána, ale přihlašovací záznam u poskytovatele zůstal (smaže ho správce)
    const deleteMyAccount = async () => (await accountCall('delete_my_account', 'Účet se nepodařilo smazat, zkus to znovu.')) !== false;

    // ===== Sociální vrstva: přátelé, reakce po zápase, blokování a nahlášení (tabulky a funkce přibyly pozdější verzí schématu) =====
    // Dokud je databáze nemá (404), vrací se prázdný výsledek / null a dál se o ně nežádá (po novém načtení stránky se zkusí znovu); jiné chyby se vyhodí.
    let socialMissing = false;
    const guardSocial = async (run, empty) => {
        if (socialMissing) return empty;
        try { return await run(); } catch (error) {
            if (error.status === 404) { socialMissing = true; return empty; }
            throw error;
        }
    };
    // Hlášky databáze jsou česky (triggery); cokoli jiného se nahradí srozumitelným textem
    const socialCall = async (run, fallback) => {
        if (socialMissing) throw new SocialError('Tahle část zatím není k dispozici (databáze potřebuje nejnovější schema.sql).', 404);
        try { return await run(); } catch (error) {
            if (error instanceof SocialError && error.status === 404) { socialMissing = true; throw new SocialError('Tahle část zatím není k dispozici (databáze potřebuje nejnovější schema.sql).', 404); }
            if (error instanceof SocialError && error.status === 401) throw new SocialError('Nejsi přihlášený.', 401);
            if (error instanceof SocialError && error.status < 500 && CZECH_MESSAGE.test(error.message)) throw error;
            throw new SocialError(fallback, error && error.status);
        }
    };
    const isUuid = (value) => typeof value === 'string' && /^[0-9a-zA-Z-]{1,40}$/.test(value);
    const needId = (value) => { if (!isUuid(value)) throw new SocialError('Neplatný hráč.', 400); return value; };
    // Poslední aktivita: nejvýš jednou za 5 minut z klienta (server si to hlídá taky)
    let seenAt = 0;
    const touchSeen = () => {
        if (Date.now() - seenAt < 5 * 60 * 1000) return Promise.resolve(false);
        seenAt = Date.now();
        return guardSocial(async () => { await request('POST', 'rpc/touch_seen', { body: {} }); return true; }, null);
    };
    const cleanFriend = (row) => ({
        id: String(row.id), display_name: String(row.display_name || 'Hráč'), avatar: row.avatar, color: row.color, frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl),
        rating: cleanRatingNumber(row.rating), last_seen: row.last_seen ? String(row.last_seen) : null, status: row.status === 'accepted' ? 'accepted' : 'pending', direction: row.direction === 'in' ? 'in' : 'out',
        since: row.since ? String(row.since) : null, wins: wholeNumber(row.wins, 100000), losses: wholeNumber(row.losses, 100000), draws: wholeNumber(row.draws, 100000)
    });
    // Přátelé a žádosti oběma směry; null = databáze přátele nemá
    const friendsList = () => guardSocial(async () => ((await request('POST', 'rpc/friends_list', { body: {} })) || []).map(cleanFriend), null);
    const addFriend = (userId, otherId) => socialCall(() => request('POST', 'friendships', { body: { user_id: userId, friend_id: needId(otherId), status: 'pending' }, prefer: 'return=minimal,resolution=ignore-duplicates' }), 'Žádost se nepodařilo odeslat. Zkus to znovu.');
    const acceptFriend = (userId, otherId) => socialCall(() => request('PATCH', `friendships?user_id=eq.${encodeURIComponent(needId(otherId))}&friend_id=eq.${encodeURIComponent(userId)}`, { body: { status: 'accepted' }, prefer: 'return=minimal' }), 'Přijetí se nepodařilo. Zkus to znovu.');
    const removeFriend = (userId, otherId) => socialCall(() => request('DELETE', `friendships?or=(and(user_id.eq.${encodeURIComponent(userId)},friend_id.eq.${encodeURIComponent(needId(otherId))}),and(user_id.eq.${encodeURIComponent(otherId)},friend_id.eq.${encodeURIComponent(userId)}))`, { prefer: 'return=minimal' }), 'Zrušení se nepodařilo. Zkus to znovu.');
    // Reakce po zápase: target = { challengeId } nebo { matchId }; opakovaná reakce tu první přepíše
    const REACTIONS = ['👍', '🔥', '😅', '🤝'];
    const react = (userId, target, toId, emoji) => socialCall(() => {
        if (!REACTIONS.includes(emoji)) throw new SocialError('Neznámá reakce.', 400);
        const body = { from_id: userId, to_id: needId(toId), emoji, challenge_id: target.challengeId ? parseCode(target.challengeId) || null : null, match_id: target.matchId ? needTournamentId(target.matchId, 'zápas') : null };
        if (!body.challenge_id && !body.match_id) throw new SocialError('Neplatný zápas.', 400);
        return request('POST', 'match_reactions?on_conflict=challenge_id,match_id,from_id', { body, prefer: 'return=minimal,resolution=merge-duplicates' });
    }, 'Reakci se nepodařilo poslat. Zkus to znovu.');
    const cleanReaction = (row) => ({ id: row.id, challenge_id: row.challenge_id || null, match_id: row.match_id || null, from_id: String(row.from_id), to_id: String(row.to_id), emoji: REACTIONS.includes(row.emoji) ? row.emoji : null, created_at: String(row.created_at || '') });
    // Reakce k zápasům (poslané i přijaté); challengeIds = kódy výzev, matchIds = zápasy turnaje
    const reactionsFor = ({ challengeIds = [], matchIds = [] }) => guardSocial(async () => {
        const codes = challengeIds.map(parseCode).filter(Boolean);
        const mids = matchIds.filter(isTournamentId);
        if (!codes.length && !mids.length) return [];
        const filter = codes.length && mids.length ? `or=(challenge_id.in.(${codes.join(',')}),match_id.in.(${mids.join(',')}))` : codes.length ? `challenge_id=in.(${codes.join(',')})` : `match_id=in.(${mids.join(',')})`;
        return ((await request('GET', `match_reactions?${filter}&select=id,challenge_id,match_id,from_id,to_id,emoji,created_at&limit=200`)) || []).map(cleanReaction);
    }, []);
    // Poslední reakce, kterou mi hráč poslal; null = žádná (nebo databáze reakce nemá)
    const lastReactionFrom = (userId, otherId) => guardSocial(async () => {
        const rows = (await request('GET', `match_reactions?from_id=eq.${encodeURIComponent(needId(otherId))}&to_id=eq.${encodeURIComponent(userId)}&select=id,challenge_id,match_id,from_id,to_id,emoji,created_at&order=created_at.desc&limit=1`)) || [];
        return rows[0] ? cleanReaction(rows[0]) : null;
    }, null);
    // Blokování: zablokovaní hráči s profilem; null = databáze bloky nemá
    const blockedPlayers = (userId) => guardSocial(async () => {
        const rows = await withExtras(extras => request('GET', `player_blocks?blocker=eq.${encodeURIComponent(userId)}&select=blocked,created_at,player:profiles!blocked(${profileFields(extras)})&order=created_at.desc&limit=500`)) || [];
        return rows.filter(row => row.player).map(row => ({ id: String(row.blocked), created_at: String(row.created_at || ''), player: row.player }));
    }, null);
    const blockPlayer = (userId, otherId) => socialCall(() => request('POST', 'player_blocks', { body: { blocker: userId, blocked: needId(otherId) }, prefer: 'return=minimal,resolution=ignore-duplicates' }), 'Zablokování se nepodařilo. Zkus to znovu.');
    const unblockPlayer = (userId, otherId) => socialCall(() => request('DELETE', `player_blocks?blocker=eq.${encodeURIComponent(userId)}&blocked=eq.${encodeURIComponent(needId(otherId))}`, { prefer: 'return=minimal' }), 'Odblokování se nepodařilo. Zkus to znovu.');
    // Nahlášení hráče: důvod z REPORT_REASONS, poznámka nejvýš 300 znaků
    const REPORT_REASONS = [
        { id: 'prezdivka', label: 'Nevhodná přezdívka' }, { id: 'obrazek', label: 'Nevhodný obrázek' }, { id: 'podvadeni', label: 'Podvádění' },
        { id: 'obtezovani', label: 'Obtěžování' }, { id: 'jine', label: 'Jiné' }
    ];
    const reportPlayer = (userId, otherId, reason, note = '') => socialCall(() => {
        if (!REPORT_REASONS.some(item => item.id === reason)) throw new SocialError('Vyber důvod nahlášení.', 400);
        const text = String(note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        return request('POST', 'player_reports', { body: { reporter: userId, reported: needId(otherId), reason, note: text || null }, prefer: 'return=minimal' });
    }, 'Nahlášení se nepodařilo odeslat. Zkus to znovu.');
    // Správce (dev_admins): seznam nahlášení a označení za vyřešené; chyba serveru se předá tak, jak je
    const devReports = async () => {
        try { return ((await request('POST', 'rpc/dev_player_reports', { body: {} })) || []).map(row => ({ ...row, id: Number(row.id), reason: REPORT_REASONS.some(item => item.id === row.reason) ? row.reason : 'jine' })); } catch (error) {
            if (error.status === 404) throw new SocialError('Nahlášení v databázi chybí: spusť znovu supabase/schema.sql.', 404);
            if (error.status === 401 || error.status === 403 || /dev_admins/.test(String(error.message))) throw new SocialError('Tenhle účet není v dev_admins (návod v docs/SUPABASE.md).', 403);
            throw error;
        }
    };
    const devResolveReport = (id) => request('POST', 'rpc/dev_report_resolve', { body: { rid: wholeNumber(id, Number.MAX_SAFE_INTEGER) } });

    // --- Kvíz dne (schéma 7): stav dnešního pokusu, začátek, odpověď po otázkách, pořadí dne a přátel ---
    // Databáze bez funkcí (404): vrací se null a dál se o ně nežádá (aplikace pak hraje jen v zařízení, bez pořadí); jiné chyby se vyhodí
    let quizMissing = false;
    const guardQuiz = async (run) => {
        if (quizMissing) return null;
        try { return await run(); } catch (error) {
            if (error.status === 404) { quizMissing = true; return null; }
            throw error;
        }
    };
    const cleanDay = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
    const cleanQuizState = (row) => (row && typeof row === 'object' ? {
        day: cleanDay(row.day), started: Boolean(row.started), answered: wholeNumber(row.answered, 10), correct: wholeNumber(row.correct, 10), score: wholeNumber(row.score, 40),
        time_ms: wholeNumber(row.time_ms, 3000000), bitmap: wholeNumber(row.bitmap, 1023), finished: Boolean(row.finished), streak: wholeNumber(row.streak, 100000), best_streak: wholeNumber(row.best_streak, 100000)
    } : null);
    const cleanQuizRow = (row) => ({
        rank: wholeNumber(row.rank, 10000000) || 1, id: String(row.id), display_name: String(row.display_name || 'Hráč'), avatar: row.avatar, color: row.color,
        frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl),
        score: wholeNumber(row.score, 40), correct: wholeNumber(row.correct, 10), time_ms: wholeNumber(row.time_ms, 3000000), me: row.me === true
    });
    const dailyQuizState = () => guardQuiz(async () => cleanQuizState(await request('POST', 'rpc/daily_quiz_state', { body: {} })));
    const dailyQuizStart = () => guardQuiz(async () => cleanQuizState(await request('POST', 'rpc/daily_quiz_start', { body: {} })));
    // row = { correct, points, ms, answer?, hints? }: body za správnou 1–4, za špatnou 0, čas na otázku v ms (server ho ověří); text odpovědi
    // a nápovědy pro rozpis (schéma 15) – starší databáze funkci s nimi nezná (404/400), pak se pošle jen základ a podrobnosti už ne
    let quizDetailsMissing = false;
    const dailyQuizAnswer = (day, idx, row) => guardQuiz(async () => {
        const base = { for_day: cleanDay(day), idx: wholeNumber(idx, 9), is_correct: Boolean(row && row.correct), points: row && row.correct ? Math.max(1, wholeNumber(row.points, 4)) : 0, ms: wholeNumber(row && row.ms, 3600000) };
        if (!quizDetailsMissing) {
            const extra = cleanDetails(row);
            try { return cleanQuizState(await request('POST', 'rpc/daily_quiz_answer', { body: { ...base, answer: extra.answer, hints: extra.hints } })); } catch (error) {
                if (error.status !== 400 && error.status !== 404) throw error;
                quizDetailsMissing = true;
            }
        }
        return cleanQuizState(await request('POST', 'rpc/daily_quiz_answer', { body: base }));
    });
    // Odpovědi hráčů z pořadí dne po otázkách ({ [userId]: [...] }); null = databáze rozpis Kvízu dne nezná (starší schéma)
    const dailyQuizDetails = (day, players) => breakdownCall('daily_quiz_details', { for_day: cleanDay(day), players: (players || []).map(String).slice(0, 10) }, 10, 4);
    const dailyQuizBoard = (day = null, top = 50) => guardQuiz(async () => {
        const data = (await request('POST', 'rpc/daily_quiz_board', { body: { for_day: cleanDay(day), top_n: wholeNumber(top, 100) || 50 } })) || {};
        const me = data.me && typeof data.me === 'object' ? { rank: wholeNumber(data.me.rank, 10000000) || 1, score: wholeNumber(data.me.score, 40), correct: wholeNumber(data.me.correct, 10), time_ms: wholeNumber(data.me.time_ms, 3000000), bitmap: wholeNumber(data.me.bitmap, 1023), answered: wholeNumber(data.me.answered, 10) } : null;
        return { day: cleanDay(data.day), total: wholeNumber(data.total, 10000000), top: (Array.isArray(data.top) ? data.top : []).map(cleanQuizRow), me, streak: wholeNumber(data.streak, 100000), best_streak: wholeNumber(data.best_streak, 100000) };
    });
    const dailyQuizFriends = (day = null) => guardQuiz(async () => {
        const data = (await request('POST', 'rpc/daily_quiz_friends', { body: { for_day: cleanDay(day) } })) || {};
        return { day: cleanDay(data.day), friends: wholeNumber(data.friends, 100000), rows: (Array.isArray(data.rows) ? data.rows : []).map(cleanQuizRow) };
    });
    // --- Tajemná otázka dne (schéma 19, mystery.js): můj stav, tip, statistiky dne a výsledky přátel ---
    // Databáze bez funkcí (404): vrací se null a dál se o ně nežádá (aplikace hraje jen v zařízení, bez výsledků ostatních); jiné chyby se vyhodí
    let mysteryMissing = false;
    const guardMystery = async (run) => {
        if (mysteryMissing) return null;
        try { return await run(); } catch (error) {
            if (error.status === 404) { mysteryMissing = true; return null; }
            throw error;
        }
    };
    const clockText = (value) => (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value) ? value : null);
    const cleanMysteryState = (row) => (row && typeof row === 'object' ? {
        day: cleanDay(row.day), guesses: wholeNumber(row.guesses, 3), solved: row.solved === true, clues: wholeNumber(row.clues, 8), points: wholeNumber(row.points, 10),
        solved_at: clockText(row.solved_at), finished: row.finished === true, clues_now: wholeNumber(row.clues_now, 8)
    } : null);
    const mysteryState = () => guardMystery(async () => cleanMysteryState(await request('POST', 'rpc/mystery_state', { body: {} })));
    // Tip idx (0–2) na dnešní otázku: správně / špatně a kolik nápověd hráč viděl (body počítá server)
    const mysteryGuess = (day, idx, correct, clues) => guardMystery(async () => cleanMysteryState(await request('POST', 'rpc/mystery_guess', {
        body: { for_day: cleanDay(day), idx: wholeNumber(idx, 2), is_correct: Boolean(correct), clues: Math.max(1, wholeNumber(clues, 8)) }
    })));
    const mysteryStats = (day = null) => guardMystery(async () => {
        const data = (await request('POST', 'rpc/mystery_stats', { body: { for_day: cleanDay(day) } })) || {};
        if (data.hidden) return { day: cleanDay(data.day), hidden: true };
        const avg = Number(data.avg_clues);
        return { day: cleanDay(data.day), hidden: false, players: wholeNumber(data.players, 10000000), solved: wholeNumber(data.solved, 10000000), solved_pct: wholeNumber(data.solved_pct, 100),
            fastest: clockText(data.fastest), avg_clues: Number.isFinite(avg) && avg > 0 ? Math.round(Math.min(8, avg) * 10) / 10 : null,
            me: data.me && typeof data.me === 'object' ? { solved: data.me.solved === true, clues: wholeNumber(data.me.clues, 8), guesses: wholeNumber(data.me.guesses, 3), points: wholeNumber(data.me.points, 10), solved_at: clockText(data.me.solved_at) } : null };
    });
    const mysteryFriends = (day = null) => guardMystery(async () => {
        const data = (await request('POST', 'rpc/mystery_friends', { body: { for_day: cleanDay(day) } })) || {};
        if (data.hidden) return { day: cleanDay(data.day), hidden: true, friends: 0, rank: null, rows: [] };
        const rows = (Array.isArray(data.rows) ? data.rows : []).map(row => ({
            rank: wholeNumber(row.rank, 100000) || 1, id: String(row.id), display_name: String(row.display_name || 'Hráč'), avatar: row.avatar, color: row.color,
            frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl),
            solved: row.solved === true, clues: wholeNumber(row.clues, 8), guesses: wholeNumber(row.guesses, 3), points: wholeNumber(row.points, 10), solved_at: clockText(row.solved_at), me: row.me === true
        }));
        return { day: cleanDay(data.day), hidden: false, friends: wholeNumber(data.friends, 100000), rank: wholeNumber(data.rank, 100000) || null, rows };
    });
    // --- Boss týdne (schéma 21, boss.js): odeslání dohraného souboje, společná lišta týdne a společný bonus za skončený týden ---
    // Databáze bez funkcí (404): vrací se null a dál se o ně nežádá (aplikace hraje jen v zařízení, bez společné lišty); jiné chyby se vyhodí
    let bossMissing = false;
    const guardBoss = async (run) => {
        if (bossMissing) return null;
        try { return await run(); } catch (error) {
            if (error.status === 404) { bossMissing = true; return null; }
            throw error;
        }
    };
    const cleanWeek = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
    const cleanBossMe = (row) => (row && typeof row === 'object' ? {
        week: cleanWeek(row.week), attempts: wholeNumber(row.attempts, 3), best_damage: wholeNumber(row.best_damage, 700), defeated: row.defeated === true,
        bonus_claimed: row.bonus_claimed === true, first_win: row.first_win === true
    } : null);
    // Dohraný souboj: týden (pondělí), idx = kolikátý pokus (0–2), poškození 0–700, výhra; vrátí můj stav týdne s first_win
    const bossSubmit = (week, idx, damage, defeated) => guardBoss(async () => cleanBossMe(await request('POST', 'rpc/boss_submit', {
        body: { for_week: cleanWeek(week), idx: wholeNumber(idx, 2), damage: wholeNumber(damage, 700), is_defeated: Boolean(defeated) }
    })));
    // Společná lišta týdne (null = běžící týden): hráči, kteří to zkusili, kolik bosse porazilo, splněná polovina, konec týdne a můj stav
    const bossWeekStats = (week = null) => guardBoss(async () => {
        const data = (await request('POST', 'rpc/boss_week_stats', { body: { for_week: cleanWeek(week) } })) || {};
        return { week: cleanWeek(data.week), players: wholeNumber(data.players, 10000000), defeated: wholeNumber(data.defeated, 10000000), defeated_pct: wholeNumber(data.defeated_pct, 100),
            reached: data.reached === true, over: data.over === true, me: cleanBossMe(data.me) };
    });
    // Společný bonus za skončený týden: { xp (kolik si připsat), reached, played, claimed }
    const bossClaimBonus = (week) => guardBoss(async () => {
        const data = (await request('POST', 'rpc/boss_claim_bonus', { body: { for_week: cleanWeek(week) } })) || {};
        return { week: cleanWeek(data.week), xp: Math.min(50, wholeNumber(data.xp, 50)), reached: data.reached === true, played: data.played === true, claimed: data.claimed === true };
    });
    // --- Řetězovka dne (blok 21 ve schema.sql, chain.js): odeslání výsledku dne a pořadí dne ---
    // Databáze bez funkcí (404): vrací se null a dál se o ně nežádá (hraje se jen v zařízení, bez pořadí); jiné chyby se vyhodí
    let chainMissing = false;
    const guardChain = async (run) => {
        if (chainMissing) return null;
        try { return await run(); } catch (error) {
            if (error.status === 404) { chainMissing = true; return null; }
            throw error;
        }
    };
    const cleanChainMe = (row) => (row && typeof row === 'object'
        ? { links: wholeNumber(row.links, 7), score: wholeNumber(row.score, 28), rescued: row.rescued === true, rank: wholeNumber(row.rank, 10000000) || null } : null);
    // Výsledek dne (články, body, Záchrana); server přijme jen první výsledek dne a vrátí ten uložený
    const chainSubmit = (day, links, score, rescued) => guardChain(async () => cleanChainMe(await request('POST', 'rpc/chain_submit', {
        body: { for_day: cleanDay(day), links: wholeNumber(links, 7), score: wholeNumber(score, 28), rescued: Boolean(rescued) }
    })));
    // Hráči dne, podíl celých řetězů, nejlepší výsledek, moje místo a nejlepší hráči (top)
    const chainDayStats = (day = null) => guardChain(async () => {
        const data = (await request('POST', 'rpc/chain_day_stats', { body: { for_day: cleanDay(day) } })) || {};
        const top = (Array.isArray(data.top) ? data.top : []).filter(row => row && row.id).map(row => ({
            rank: wholeNumber(row.rank, 10000000) || 1, id: String(row.id), display_name: String(row.display_name || 'Hráč'), avatar: row.avatar, color: row.color,
            frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl),
            links: wholeNumber(row.links, 7), score: wholeNumber(row.score, 28), rescued: row.rescued === true, me: row.me === true
        }));
        return { day: cleanDay(data.day), players: wholeNumber(data.players, 10000000), full: wholeNumber(data.full, 10000000), full_pct: wholeNumber(data.full_pct, 100),
            best: wholeNumber(data.best, 28), me: cleanChainMe(data.me), top };
    });
    // --- Skupiny (schéma 8, groups.js): moje skupiny, detail s pořadím, založení, přidání kódem a správa zakladatelem ---
    // Databáze bez funkcí (404): seznam vrací null (aplikace Skupiny nenabídne) a dál se o ně nežádá; ostatní volání skončí srozumitelnou chybou.
    // Hlášky databáze jsou česky (limit skupin, plná skupina, jen zakladatel…) a předají se dál; jiné chyby nahradí obecný text.
    let groupsMissing = false;
    const GROUPS_MISSING = 'Skupiny zatím nejsou k dispozici (databáze potřebuje nejnovější schema.sql).';
    const groupsCall = async (name, body, fallback) => {
        if (groupsMissing) throw new SocialError(GROUPS_MISSING, 404);
        try { return await request('POST', `rpc/${name}`, { body }); } catch (error) {
            if (error instanceof SocialError && error.status === 404) { groupsMissing = true; throw new SocialError(GROUPS_MISSING, 404); }
            if (error instanceof SocialError && error.status === 401) throw new SocialError('Nejsi přihlášený.', 401);
            if (error instanceof SocialError && error.status < 500 && CZECH_MESSAGE.test(error.message)) throw error;
            throw new SocialError(fallback, error && error.status);
        }
    };
    const GROUP_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
    const needGroup = (value) => { if (!isUuid(value)) throw new SocialError('Neplatná skupina.', 400); return value; };
    const cleanGroupCode = (value) => { const code = String(value || '').toUpperCase().replace(/[\s-]/g, ''); return GROUP_CODE.test(code) ? code : ''; };
    const cleanGroupPlayer = (row) => row && typeof row === 'object' && row.id ? {
        id: String(row.id), display_name: String(row.display_name || 'Hráč'), avatar: row.avatar, color: row.color, frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl)
    } : null;
    const cleanGroup = (row) => row && typeof row === 'object' && isUuid(row.id) ? {
        id: String(row.id), name: String(row.name || 'Skupina').slice(0, 40), icon: typeof row.icon === 'string' ? row.icon.slice(0, 8) : '🦉', code: cleanGroupCode(row.code),
        owner_id: row.owner_id ? String(row.owner_id) : null, is_owner: row.is_owner === true, members: wholeNumber(row.members, 1000),
        played_today: row.played_today === true,
        leader: row.leader ? { ...cleanGroupPlayer(row.leader), score: wholeNumber(row.leader.score, 40), time_ms: wholeNumber(row.leader.time_ms, 3000000), me: row.leader.me === true } : null
    } : null;
    const cleanGroupRow = (row) => ({
        ...cleanGroupPlayer(row), owner: row.owner === true, me: row.me === true, joined_at: row.joined_at ? String(row.joined_at) : null,
        today: row.today && typeof row.today === 'object' ? { score: wholeNumber(row.today.score, 40), correct: wholeNumber(row.today.correct, 10), time_ms: wholeNumber(row.today.time_ms, 3000000) } : null,
        week_score: wholeNumber(row.week_score, 280), week_correct: wholeNumber(row.week_correct, 70), week_time_ms: wholeNumber(row.week_time_ms, 21000000),
        week_days: wholeNumber(row.week_days, 7), week_xp: wholeNumber(row.week_xp, 100000)
    });
    const cleanGroupChallenge = (row) => row && typeof row === 'object' && parseCode(row.id) ? {
        id: parseCode(row.id), topic: String(row.topic || 'mix'), count: wholeNumber(row.count, 20), created_at: row.created_at ? String(row.created_at) : null, creator: cleanGroupPlayer(row.creator),
        results: (Array.isArray(row.results) ? row.results : []).map(item => ({ user_id: String(item.user_id), correct: wholeNumber(item.correct, 20), points: wholeNumber(item.points, 160) }))
    } : null;
    // Moje skupiny s dnešním vedoucím Kvízu dne; null = databáze skupiny nemá
    const myGroups = async () => {
        if (groupsMissing) return null;
        try {
            const rows = await groupsCall('my_groups', {}, 'Skupiny se nepodařilo načíst.');
            return (Array.isArray(rows) ? rows : []).map(cleanGroup).filter(Boolean);
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    };
    const groupDetail = async (groupId) => {
        const data = await groupsCall('group_detail', { gid: needGroup(groupId) }, 'Skupinu se nepodařilo načíst. Zkontroluj připojení.');
        const group = cleanGroup(data);
        if (!group) throw new SocialError('Skupinu se nepodařilo načíst.', 500);
        return { ...group, day: cleanDay(data.day), week_start: cleanDay(data.week_start), rows: (Array.isArray(data.rows) ? data.rows : []).filter(row => row && row.id).map(cleanGroupRow), challenge: cleanGroupChallenge(data.challenge) };
    };
    const groupCreate = async (name, icon) => cleanGroup(await groupsCall('group_create', { group_name: String(name || '').slice(0, 80), group_icon: String(icon || '') }, 'Skupinu se nepodařilo založit. Zkus to znovu.'));
    // Náhled a přidání kódem: null = skupina s tímhle kódem není
    const groupPreview = async (code) => {
        const clean = cleanGroupCode(code);
        if (!clean) return null;
        const data = await groupsCall('group_preview', { join_code: clean }, 'Skupinu se nepodařilo najít. Zkontroluj připojení.');
        return data && isUuid(data.id) ? { id: String(data.id), name: String(data.name || 'Skupina').slice(0, 40), icon: typeof data.icon === 'string' ? data.icon.slice(0, 8) : '🦉', code: clean, members: wholeNumber(data.members, 1000), owner: cleanGroupPlayer(data.owner), member: data.member === true } : null;
    };
    const groupJoin = async (code) => {
        const clean = cleanGroupCode(code);
        if (!clean) return null;
        return cleanGroup(await groupsCall('group_join', { join_code: clean }, 'Přidání do skupiny se nepodařilo. Zkus to znovu.'));
    };
    const groupLeave = (groupId) => groupsCall('group_leave', { gid: needGroup(groupId) }, 'Skupinu se nepodařilo opustit. Zkus to znovu.');
    const groupUpdate = async (groupId, name, icon) => cleanGroup(await groupsCall('group_update', { gid: needGroup(groupId), group_name: String(name || '').slice(0, 80), group_icon: String(icon || '') }, 'Změnu se nepodařilo uložit. Zkus to znovu.'));
    const groupNewCode = async (groupId) => cleanGroupCode(await groupsCall('group_regenerate_code', { gid: needGroup(groupId) }, 'Nový kód se nepodařilo vytvořit. Zkus to znovu.'));
    const groupRemoveMember = (groupId, memberId) => groupsCall('group_remove_member', { gid: needGroup(groupId), member_id: needId(memberId) }, 'Člena se nepodařilo odebrat. Zkus to znovu.');
    const groupDelete = (groupId) => groupsCall('group_delete', { gid: needGroup(groupId) }, 'Skupinu se nepodařilo smazat. Zkus to znovu.');
    // Výzva skupině: kód výzvy pro kohokoli (createChallenge bez soupeře) se připojí ke skupině
    const groupSetChallenge = (groupId, code) => {
        const clean = parseCode(code);
        if (!clean) throw new SocialError('Neplatná výzva.', 400);
        return groupsCall('group_set_challenge', { gid: needGroup(groupId), challenge_code: clean }, 'Výzvu se nepodařilo poslat skupině. Zkus to znovu.');
    };
    // ===== Jak odpověděli ostatní (schéma 6, answer-stats.js): dávka odpovědí po hře, souhrn tématu, podezřelé otázky pro dev_admins =====
    // Starší databáze bez funkcí (404): odeslání i stažení vrací null a dál se o ně nežádá (po novém načtení stránky se zkusí znovu); jiné chyby se vyhodí.
    let answerStatsMissing = false;
    const answerStatsCall = async (name, body) => {
        if (answerStatsMissing) return null;
        try { return await request('POST', `rpc/${name}`, { body }); } catch (error) {
            if (error.status === 404) { answerStatsMissing = true; return null; }
            throw error;
        }
    };
    // answers = [{ t, q, k, v, c, w? }] z MudrlantAnswerStats (nejvýš 30); vrací počet započtených, null = databáze statistiky neumí
    const submitAnswerStats = async (answers) => {
        const list = (Array.isArray(answers) ? answers : []).slice(0, 30);
        if (!list.length) return 0;
        const counted = await answerStatsCall('answer_stats_submit', { answers: list });
        return counted === null ? null : wholeNumber(counted, 30);
    };
    // Souhrn tématu [[položka, druh, 'c' | 't', zobrazeno, správně], …]; null = databáze statistiky neumí
    const answerStatsTopic = async (topic) => {
        if (!/^[a-z0-9-]{1,24}$/.test(String(topic || ''))) throw new SocialError('Neplatné téma.', 400);
        const rows = await answerStatsCall('answer_stats_topic', { topic_id: topic });
        return rows === null ? null : (Array.isArray(rows) ? rows : []);
    };
    const devSuspiciousQuestions = async () => {
        try { return (await request('POST', 'rpc/dev_suspicious_questions', { body: {} })) || []; } catch (error) {
            if (error.status === 404) throw new SocialError('Statistiky odpovědí v databázi chybí: spusť znovu supabase/schema.sql (verze 6).', 404);
            if (error.status === 401 || error.status === 403 || /dev_admins/.test(String(error.message))) throw new SocialError('Tenhle účet není v dev_admins (návod v docs/SUPABASE.md).', 403);
            throw error;
        }
    };

    // ===== Odměny (schéma 9, rewards.js): věci z Truhly Mudrlanta, ochrany série a diplomy v profiles.rewards =====
    // Sloupec přibyl schématem 9: dokud ho databáze nemá (400), vrací se null a dál se o něj nežádá (po novém načtení se zkusí znovu)
    let rewardsMissing = false;
    const guardRewards = async (run) => {
        if (rewardsMissing) return null;
        try { return await run(); } catch (error) {
            if (error.status === 400 || error.status === 404) { rewardsMissing = true; return null; }
            throw error;
        }
    };
    // { rewards: objekt nebo null } (řádek bez sloupce = null)
    const getRewards = (userId) => guardRewards(async () => {
        const row = ((await request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=rewards`)) || [])[0];
        return row ? { rewards: row.rewards && typeof row.rewards === 'object' && !Array.isArray(row.rewards) ? row.rewards : null } : null;
    });
    const saveRewards = (userId, rewards) => guardRewards(async () => {
        await request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body: { rewards }, prefer: 'return=minimal' });
        return true;
    });

    // ===== Ligové sezóny a vitrína v profilu (schéma 18, league-seasons.js a showcase.js) =====
    // Dokud je databáze nemá (funkce 404, sloupec 400), vrací se null (aplikace sezóny a vitrínu neukáže) a dál se o ně nežádá
    // (po novém načtení stránky se zkusí znovu); jiné chyby (síť) se vyhodí.
    let seasonsMissing = false;
    // Sezóny přihlášeného hráče, nebo cizího (playerId): { month, seasons, best } jak je vrací league_seasons; čistí league-seasons.js
    const leagueSeasons = async (playerId = null) => {
        if (seasonsMissing) return null;
        try {
            const data = await request('POST', 'rpc/league_seasons', { body: playerId ? { player: needId(playerId) } : {} });
            return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
        } catch (error) {
            // Funkce chybí (PostgREST odpoví 404); jiná chyba (síť, špatný hráč) sezóny nevypne
            if (error.status === 404) { seasonsMissing = true; return null; }
            throw error;
        }
    };
    // Položky vitríny: stejný tvar jako showcase.js a showcase_format_ok() v databázi, bez opakování, nejvýš 3
    const SHOWCASE_ENTRY = /^(?:b:[a-z0-9-]{1,40}|d:[a-z0-9-]{1,24}|l:\d{4}-(?:0[1-9]|1[0-2]):(?:bronz|stribro|zlato|platina|diamant|mistr))$/;
    const cleanShowcase = (value) => [...new Set((Array.isArray(value) ? value : []).filter(item => typeof item === 'string' && SHOWCASE_ENTRY.test(item)))].slice(0, 3);
    let showcaseMissing = false;
    // Vitrína hráče (cizího i vlastní); null = databáze vitrínu nemá
    const getShowcase = async (userId) => {
        if (showcaseMissing) return null;
        try {
            const row = ((await request('GET', `profiles?id=eq.${encodeURIComponent(needId(userId))}&select=showcase`)) || [])[0];
            return row ? cleanShowcase(row.showcase) : [];
        } catch (error) {
            if (error.status === 400 || error.status === 404) { showcaseMissing = true; return null; }
            throw error;
        }
    };
    // Uloží moji vitrínu a vrátí, co server přijal (odznak, který v účtu není, nebo sezónu, která nebyla, tiše vyřadí); null = vitrína v databázi není
    const saveShowcase = async (userId, list) => {
        if (showcaseMissing) return null;
        const clean = cleanShowcase(list);
        try {
            const rows = await request('PATCH', `profiles?id=eq.${encodeURIComponent(needId(userId))}&select=showcase`, { body: { showcase: clean }, prefer: 'return=representation' });
            return Array.isArray(rows) && rows[0] ? cleanShowcase(rows[0].showcase) : clean;
        } catch (error) {
            // Tvar čistí cleanShowcase, takže 400 znamená chybějící sloupec (starší schéma)
            if (error.status === 400 || error.status === 404) { showcaseMissing = true; return null; }
            throw error;
        }
    };

    // ===== Dobývání (schéma 21, conquest.js a conquest-ui.js): lobby, založení, přidání, Chci hrát, odchod, stav, tah a odměna =====
    // Databáze bez funkcí (404): srozumitelná chyba a dál se o ně nežádá (po novém načtení stránky se zkusí znovu). České hlášky databáze
    // (plná hra, obsazená barva, limity, tahy na období) se předají dál, jiné chyby nahradí obecný text.
    let conquestMissing = false;
    const CONQUEST_MISSING = 'Dobývání zatím není k dispozici (databáze potřebuje nejnovější schema.sql).';
    // Části, které přibyly později (part): pozvánky přátel (blok 24), bitvy o území (blok 25) a rychlé hry s dalším kolem (blok 26).
    // Databáze bez nich (404) Dobývání nevypne, jen ta část nejde (chyba se status 404) a dál se o ni nežádá.
    const PART_MISSING = {
        invites: 'Pozvánky do Dobývání zatím nejdou (databáze potřebuje nejnovější schema.sql).',
        sieges: 'Bitvy o území zatím nejdou (databáze potřebuje nejnovější schema.sql).',
        rounds: 'Rychlé hry a další kolo zatím nejdou (databáze potřebuje nejnovější schema.sql).'
    };
    const partMissing = { invites: false, sieges: false, rounds: false };
    const conquestCall = async (name, body, fallback, part = null) => {
        if (conquestMissing) throw new SocialError(CONQUEST_MISSING, 404);
        if (part && partMissing[part]) throw new SocialError(PART_MISSING[part], 404);
        try { return await request('POST', `rpc/${name}`, { body }); } catch (error) {
            if (error instanceof SocialError && error.status === 404 && part) { partMissing[part] = true; throw new SocialError(PART_MISSING[part], 404); }
            if (error instanceof SocialError && error.status === 404) { conquestMissing = true; throw new SocialError(CONQUEST_MISSING, 404); }
            if (error instanceof SocialError && error.status === 401) throw new SocialError('Nejsi přihlášený.', 401);
            if (error instanceof SocialError && error.status < 500 && CZECH_MESSAGE.test(error.message)) throw error;
            throw new SocialError(fallback, error && error.status);
        }
    };
    const conquestId = (value) => { if (!isUuid(value)) throw new SocialError('Neplatná hra.', 400); return value; };
    const conquestText = (value, max = 24) => String(value || '').slice(0, max);
    // Kolo (blok 26): { period, started_at, ends_at (začátek dalšího kola, nejpozději konec hry), done (všichni dohráli), ready: [id hráčů,
    // kteří chtějí další kolo, i boti], next_at (začátek dalšího kola během odpočtu, jinak null), can_ready (můžu chtít další kolo), last
    // (poslední kolo hry) }; bez kola (hra neběží, starší databáze) null
    const conquestRound = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? {
        period: wholeNumber(value.period, 1000000), started_at: value.started_at ? String(value.started_at) : null, ends_at: value.ends_at ? String(value.ends_at) : null,
        done: value.done === true, ready: Array.isArray(value.ready) ? [...new Set(value.ready.filter(isUuid))] : [],
        next_at: value.next_at ? String(value.next_at) : null, can_ready: value.can_ready === true, last: value.last === true } : null);
    // Stav nebo puls běžící hry bez kola = databáze bez bloku 26 (conquestRoundsMissing)
    const noteRound = (data) => { if (data && typeof data === 'object' && data.status === 'running' && !('round' in data)) partMissing.rounds = true; };
    // invited = čekající pozvaní přátelé (blok 24, jen hráčům hry); starší databáze ho nemá. Délka hry: minutes (blok 26, každá hra), hours
    // jen u her na hodiny a dny; round = kolo (jen stav běžící hry)
    const conquestGame = (value) => (value && typeof value === 'object' && isUuid(value.id) ? { ...value, players: Array.isArray(value.players) ? value.players.filter(row => row && row.id) : [],
        invited: Array.isArray(value.invited) ? value.invited.filter(row => row && row.id) : [], round: conquestRound(value.round) } : null);
    // { open: [hra], mine: [hra s budget, owners, claimed] }
    const conquestLobby = async () => {
        const data = (await conquestCall('conquest_lobby', {}, 'Hry se nepodařilo načíst. Zkontroluj připojení.')) || {};
        return { open: (Array.isArray(data.open) ? data.open : []).map(conquestGame).filter(Boolean), mine: (Array.isArray(data.mine) ? data.mine : []).map(conquestGame).filter(Boolean) };
    };
    // Založení: období (period) 'day' nebo 'hour' s délkou v hodinách (hours), rychlá hra s kolem 'min10' nebo 'min5' s délkou v minutách
    // (minutes, blok 26; jinak null). Databáze bez bloku 26 (404): obyčejná hra se založí postaru (bez minutes), rychlá hra nejde.
    const conquestCreate = async ({ map, players, hours, minutes = null, period, actions, visibility, color, emblem }) => {
        const body = {
            map_id: conquestText(map), players: wholeNumber(players, 8), hours: wholeNumber(hours, 168), per: conquestText(period, 8), actions_per: wholeNumber(actions, 10),
            vis: conquestText(visibility, 8), colour: conquestText(color), emblem_id: conquestText(emblem),
            minutes: minutes === null || minutes === undefined || minutes === '' ? null : wholeNumber(minutes, 10080)
        };
        const fallback = 'Hru se nepodařilo založit. Zkus to znovu.';
        try { return conquestGame(await conquestCall('conquest_create', body, fallback, 'rounds')); } catch (error) {
            if (!(error instanceof SocialError) || error.status !== 404 || !partMissing.rounds || body.minutes !== null) throw error;
            const older = { ...body };
            delete older.minutes;
            return conquestGame(await conquestCall('conquest_create', older, fallback));
        }
    };
    // Přidání: veřejná hra podle id, soukromá kódem
    const conquestJoin = async ({ game = null, code = '', color, emblem }) => conquestGame(await conquestCall('conquest_join', {
        game: game ? conquestId(game) : null, join_code: conquestText(code, 12), colour: conquestText(color), emblem_id: conquestText(emblem)
    }, 'Přidat se do hry se nepodařilo. Zkus to znovu.'));
    const conquestSetLook = async (game, color, emblem) => conquestGame(await conquestCall('conquest_set_look', { game: conquestId(game), colour: conquestText(color), emblem_id: conquestText(emblem) }, 'Barvu a znak se nepodařilo uložit.'));
    const conquestReady = async (game, ready) => conquestGame(await conquestCall('conquest_ready', { game: conquestId(game), is_ready: Boolean(ready) }, 'Nepodařilo se. Zkus to znovu.'));
    const conquestLeave = (game) => conquestCall('conquest_leave', { game: conquestId(game) }, 'Odejít ze hry se nepodařilo. Zkus to znovu.');
    const conquestState = async (game) => {
        const data = await conquestCall('conquest_state', { game: conquestId(game) }, 'Hru se nepodařilo načíst. Zkontroluj připojení.');
        noteRound(data);
        return conquestGame(data);
    };
    // Tah: kind = 'attack' | 'fortify', correct = odpověď na otázku, source = vlastní území, odkud útok vede
    const conquestMove = async (game, territory, kind, correct, source = null) => conquestGame(await conquestCall('conquest_move', {
        game: conquestId(game), target: conquestText(territory, 16), move_kind: kind === 'fortify' ? 'fortify' : 'attack', is_correct: Boolean(correct), source: source ? conquestText(source, 16) : null
    }, 'Tah se nepodařilo uložit. Zkontroluj připojení.'));
    // Vývojářští boti v Dobývání (blok 22, jen účet v dev_admins a jen ve hře, kterou sám hraje): boti do lobby, jejich tahy hned, další období
    const devConquest = async (name, body) => {
        try { return await request('POST', `rpc/${name}`, { body }); } catch (error) {
            if (error.status === 404) throw new SocialError('Boti pro Dobývání v databázi chybí: spusť znovu supabase/schema.sql.', 404);
            if (error.status === 401 || error.status === 403 || /dev_admins/.test(String(error.message))) throw new SocialError('Tenhle účet není v dev_admins (návod v docs/SUPABASE.md).', 403);
            throw error;
        }
    };
    const devConquestAddBots = async (game, count) => conquestGame(await devConquest('dev_conquest_add_bots', { game: conquestId(game), how_many: Math.max(1, wholeNumber(count, 7)) }));
    const devConquestBotsPlay = async (game) => wholeNumber(await devConquest('dev_conquest_bots_play', { game: conquestId(game) }), 1000);
    const devConquestNextPeriod = async (game) => conquestGame(await devConquest('dev_conquest_next_period', { game: conquestId(game) }));
    const conquestClaim = async (game) => {
        const data = (await conquestCall('conquest_claim', { game: conquestId(game) }, 'Výsledek se nepodařilo načíst.')) || {};
        return { place: wholeNumber(data.place, 8) || null, players: wholeNumber(data.players, 8), score: wholeNumber(data.score, 1000), eligible: data.eligible === true, claimed_now: data.claimed_now === true };
    };
    // Pozvánky přátel do hry (blok 24): pozvat (vrací souhrn hry s pozvanými), moje čekající pozvánky, odmítnout
    const conquestInvite = async (game, friends) => {
        const ids = [...new Set((Array.isArray(friends) ? friends : []).filter(isUuid))].slice(0, 7);
        if (!ids.length) throw new SocialError('Vyber, koho chceš pozvat.', 400);
        return conquestGame(await conquestCall('conquest_invite', { game: conquestId(game), friends: ids }, 'Pozvánky se nepodařilo poslat. Zkus to znovu.', 'invites'));
    };
    const cleanInviter = (row) => (row && typeof row === 'object' && isUuid(row.id) ? { id: String(row.id), display_name: String(row.display_name || 'Kamarád'), avatar: row.avatar, color: row.color,
        frame: cleanFrame(row.frame), title_pref: cleanTitlePref(row.title_pref), owl: cleanOwl(row.owl) } : null);
    // [hra s code, invited_by (kdo zve) a invited_at]; databáze bez pozvánek vyhodí chybu se status 404
    const conquestInvitesMine = async () => {
        const data = await conquestCall('conquest_invites_mine', {}, 'Pozvánky se nepodařilo načíst. Zkontroluj připojení.', 'invites');
        return (Array.isArray(data) ? data : []).map(row => {
            const game = conquestGame(row);
            return game ? { ...game, code: conquestText(row.code, 12), invited_by: cleanInviter(row.invited_by), invited_at: row.invited_at ? String(row.invited_at) : null } : null;
        }).filter(Boolean);
    };
    const conquestDeclineInvite = (game) => conquestCall('conquest_decline_invite', { game: conquestId(game) }, 'Pozvánku se nepodařilo odmítnout. Zkus to znovu.', 'invites');

    // Bitvy o území (blok 25): útok začne obléhání, sousedé se přidají, všichni dostanou stejnou otázku a odpověď vyhodnotí server.
    // Databáze bez bloku 25 hlásí chybu se status 404 a conquestSiegesMissing() pak vrací true (aplikace útočí postaru přes conquestMove).
    // Časy (now, joined_at, deadline, join_until, ends_at) jsou serverové: aplikace si z now spočítá posun proti svým hodinám.
    const siegeId = (value) => { if (!isUuid(value)) throw new SocialError('Neplatná bitva.', 400); return value; };
    // Bitva: { id, game, territory, status: 'open' | 'resolved', started_by, started_at, join_until, ends_at, resolved_at, winner, outcome,
    // mine, answered, joined_at, deadline, participants: [hráč s seat, flag_color, emblem, source, joined_at, deadline, answered, me
    // (po vyhodnocení i correct, answer_ms, result, winner, move)], can_join (puls), question/answer/correct_choice/result/move (účastník) }
    const conquestSiege = (value) => (value && typeof value === 'object' && isUuid(value.id)
        ? { ...value, participants: Array.isArray(value.participants) ? value.participants.filter(row => row && row.id) : [] } : null);
    // Otázka k odeslání: kopie bez příznaků správnosti a index správné možnosti (correct, jinak podle příznaku correct u možností);
    // null, když otázka nejde poslat (2–8 možností, nejvýš 40 kB jako na serveru)
    const SIEGE_QUESTION_MAX = 40000;
    const siegeQuestion = (question, correct = null) => {
        if (!question || typeof question !== 'object' || !Array.isArray(question.choices)) return null;
        const choices = question.choices;
        const index = correct === null || correct === undefined ? choices.findIndex(choice => choice && choice.correct === true) : Number(correct);
        if (choices.length < 2 || choices.length > 8 || !Number.isInteger(index) || index < 0 || index >= choices.length) return null;
        const strip = (item) => { const copy = { ...item }; delete copy.correct; delete copy.correct_choice; return copy; };
        const clean = { ...strip(question), choices: choices.map(choice => (choice && typeof choice === 'object' ? strip(choice) : choice)) };
        let size = Infinity;
        try { size = new TextEncoder().encode(JSON.stringify(clean)).length; } catch (error) { return null; }
        return size <= SIEGE_QUESTION_MAX ? { question: clean, correct: index } : null;
    };
    // Začátek obléhání: question = otázka tahu (jak ji sestaví conquest.js; příznaky correct se před odesláním zahodí), correct = index
    // správné možnosti (nepovinné), source = vlastní území, odkud útok vede. Vrací bitvu (účastník) s budget.
    const conquestSiegeBegin = async (game, territory, question, correct = null, source = null) => {
        const prepared = siegeQuestion(question, correct);
        if (!prepared) throw new SocialError('Otázku k bitvě se nepodařilo připravit.', 400);
        return conquestSiege(await conquestCall('conquest_siege_begin', {
            game: conquestId(game), target: conquestText(territory, 16), question: prepared.question, correct: prepared.correct, source: source ? conquestText(source, 16) : null
        }, 'Útok se nepodařilo zahájit. Zkontroluj připojení.', 'sieges'));
    };
    // Přidání do bitvy: vrací bitvu s otázkou (bez správné odpovědi), joined_at, deadline a budget; kdo už v bitvě je, dostane totéž znovu
    const conquestSiegeJoin = async (siege, source = null) => conquestSiege(await conquestCall('conquest_siege_join', {
        siege: siegeId(siege), source: source ? conquestText(source, 16) : null
    }, 'Přidat se do bitvy se nepodařilo. Zkontroluj připojení.', 'sieges'));
    // Odpověď: choice = index možnosti (null = bez odpovědi, třeba po vypršení času). Vrací { correct, status: 'waiting' | 'resolved', late,
    // answer_ms, correct_choice, siege, now } a po vyhodnocení i move (můj tah) a state (stav hry jako conquestState)
    const conquestSiegeAnswer = async (siege, choice) => {
        const pick = Number.isInteger(choice) && choice >= 0 && choice < 8 ? choice : null;
        const data = (await conquestCall('conquest_siege_answer', { siege: siegeId(siege), choice: pick }, 'Odpověď se nepodařilo odeslat. Zkontroluj připojení.', 'sieges')) || {};
        return { ...data, correct: data.correct === true, status: data.status === 'resolved' ? 'resolved' : 'waiting', late: data.late === true,
            answer_ms: Number.isFinite(Number(data.answer_ms)) && data.answer_ms !== null ? Number(data.answer_ms) : null,
            correct_choice: Number.isInteger(data.correct_choice) ? data.correct_choice : null,
            siege: conquestSiege(data.siege), move: data.move && typeof data.move === 'object' ? data.move : null, state: conquestGame(data.state) };
    };
    // Stav bitvy (účastník: i otázka, moje odpověď a po vyhodnocení výsledek); bitvu po termínu server napřed vyhodnotí
    const conquestSiegeStatus = async (siege) => conquestSiege(await conquestCall('conquest_siege_status', { siege: siegeId(siege) }, 'Stav bitvy se nepodařilo načíst. Zkontroluj připojení.', 'sieges'));
    // Puls hry (každé 1,5–3 s): { now, status, ends_at, version (když se změní, načíst conquestState), sieges: otevřené bitvy s can_join,
    // results: moje bitvy vyhodnocené v posledních 2 minutách, round: kolo (blok 26, conquestRound; null, když hra neběží) }
    const conquestPulse = async (game) => {
        const data = (await conquestCall('conquest_pulse', { game: conquestId(game) }, 'Hru se nepodařilo obnovit. Zkontroluj připojení.', 'sieges')) || {};
        noteRound(data);
        return { ...data, version: String(data.version || ''), sieges: (Array.isArray(data.sieges) ? data.sieges : []).map(conquestSiege).filter(Boolean),
            results: (Array.isArray(data.results) ? data.results : []).map(conquestSiege).filter(Boolean), round: conquestRound(data.round) };
    };
    // Chybí v databázi bitvy (blok 25)? Zjistí se až prvním voláním (třeba conquestPulse), do té doby false.
    const conquestSiegesMissing = () => partMissing.sieges;

    // Chci další kolo (blok 26): až všichni dohráli kolo (round.done), každý hráč může chtít další kolo (ready = true), nebo přestat (false,
    // jen dokud neběží odpočet). Když chtějí všichni, další kolo začne za 10 s (round.next_at). Vrací kolo (conquestRound).
    const conquestRoundReady = async (game, ready = true) => conquestRound(await conquestCall('conquest_round_ready', { game: conquestId(game), ready: ready !== false },
        'Nepodařilo se. Zkus to znovu.', 'rounds'));
    // Chybí v databázi rychlé hry a další kolo (blok 26)? Zjistí se prvním voláním (Chci další kolo, rychlá hra) nebo stavem či pulsem
    // běžící hry bez kola, do té doby false.
    const conquestRoundsMissing = () => partMissing.rounds;

    return { AVATARS, allAvatars, cleanAvatar, cleanColor, customHue, nearestColor, cleanFrame, cleanOwl, saveOwl, cleanTitlePref, saveLook, COLORS, COUNTS, NAME_MAX, SocialError, cleanName, isValidName, newCode, parseCode, getProfile, saveProfile, createChallenge, getChallenge, getResults, submitResult, myChallenges, searchPlayers, randomOpponent, incomingChallenges, playerStats, getProgress, saveProgress, getRating, getRatingChange, weeklyLeaderboard, getAccepts, saveAccepts,
        tournamentTick, getTournaments, tournamentArchive, ARCHIVE_PAGE, inTournament, devTournament, devClientErrors, isDevAdmin, schemaVersion, reportQuestion, getQuestionReports, deleteQuestionReport, exportMyData, deleteMyAccount, getTournamentEntries, getTournamentMatches, joinTournament, leaveTournament, startTournamentMatch, finishTournamentMatch, myTournamentStats, tournamentNotices, tournamentNoticesSeen,
        challengeProgress, saveChallengeProgress, tournamentAnswers, saveTournamentAnswer, claimTournamentXp, cleanAnswerLabel,
        // Rozpis otázek (schéma 10)
        challengeDetails, tournamentDetails,
        // Zamrzlé otázky (schéma 17)
        claimQuestion, questionSnapshots,
        touchSeen, friendsList, addFriend, acceptFriend, removeFriend, REACTIONS, react, reactionsFor, lastReactionFrom, blockedPlayers, blockPlayer, unblockPlayer, REPORT_REASONS, reportPlayer, devReports, devResolveReport,
        submitAnswerStats, answerStatsTopic, devSuspiciousQuestions,
        // Kvíz dne (schéma 7)
        dailyQuizState, dailyQuizStart, dailyQuizAnswer, dailyQuizDetails, dailyQuizBoard, dailyQuizFriends,
        mysteryState, mysteryGuess, mysteryStats, mysteryFriends,
        // Skupiny (schéma 8)
        myGroups, groupDetail, groupCreate, groupPreview, groupJoin, groupLeave, groupUpdate, groupNewCode, groupRemoveMember, groupDelete, groupSetChallenge,
        // Odměny (schéma 9)
        getRewards, saveRewards,
        // Ligové sezóny a vitrína (schéma 18)
        leagueSeasons, SHOWCASE_ENTRY, cleanShowcase, getShowcase, saveShowcase,
        // Boss týdne (schéma 21)
        bossSubmit, bossWeekStats, bossClaimBonus,
        // Dobývání (schéma 21)
        conquestLobby, conquestCreate, conquestJoin, conquestSetLook, conquestReady, conquestLeave, conquestState, conquestMove, conquestClaim,
        // Pozvánky přátel do Dobývání (blok 24)
        conquestInvite, conquestInvitesMine, conquestDeclineInvite,
        // Bitvy o území v Dobývání (blok 25)
        conquestSiegeBegin, conquestSiegeJoin, conquestSiegeAnswer, conquestSiegeStatus, conquestPulse, conquestSiegesMissing,
        // Rychlé hry a další kolo v Dobývání (blok 26)
        conquestRoundReady, conquestRoundsMissing,
        // Vývojářští boti v Dobývání (blok 22)
        devConquestAddBots, devConquestBotsPlay, devConquestNextPeriod,
        // Řetězovka dne (blok 21)
        chainSubmit, chainDayStats };
});
