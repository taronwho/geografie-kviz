// Profil hráče a výzvy (Supabase REST přes pravidla řádků). Všechno vyžaduje přihlášení (auth.js).
// Výzva = téma (nebo mix), semínko a počet otázek; otázky se z něj losují stejně všem hráčům, takže stačí sdílet kód.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantSocial = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    // Obrázek profilu: emoji a barva (bez nahrávání fotek – bez moderace a bez cizích adres v CSP)
    // Základní obrázky (pro každého); další se odemykají úrovní (MudrlantLook.AVATARS, look.js se načítá až po tomto souboru, proto se čte až při použití)
    const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐵', '🐨', '🐧', '🦋', '🐢', '🐬', '🐝', '🦔', '🐳', '🐰', '🐱', '🐶', '🦦'];
    const unlockableAvatars = () => { const look = root.MudrlantLook || globalThis.MudrlantLook; return look && look.AVATARS ? look.AVATARS.map(item => item.id) : []; };
    const allAvatars = () => [...AVATARS, ...unlockableAvatars().filter(id => !AVATARS.includes(id))];
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
        const patch = { display_name: cleanName(name), avatar: allAvatars().includes(avatar) ? avatar : AVATARS[0], color: cleanColor(color) };
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
    const createChallenge = async (userId, { topic, count, invitedId = null, includeHard = false, categories = [], variant = null }) => {
        if (!COUNTS.includes(count)) throw new SocialError('Neplatný počet otázek.', 400);
        for (let attempt = 0; attempt < 4; attempt++) {
            const id = newCode();
            try {
                const rows = await request('POST', 'challenges', { body: { id, creator_id: userId, topic, seed: `vyzva-${id}-${Date.now().toString(36)}`, count, invited_id: invitedId, include_hard: Boolean(includeHard), categories: (categories || []).slice(0, 20), variant: variant === 'typed' || variant === 'choices' ? variant : null }, prefer: 'return=representation' });
                return rows[0];
            } catch (error) {
                if (error.status !== 409) throw error;
            }
        }
        throw new SocialError('Výzvu se nepodařilo založit.', 409);
    };
    const getChallenge = async (code) => (await withExtras(extras => request('GET', `challenges?id=eq.${encodeURIComponent(code)}&select=id,topic,seed,count,created_at,include_hard,categories,variant,creator:profiles!creator_id(${profileFields(extras)}),invited:profiles!invited_id(${profileFields(extras)})`)) || [])[0] || null;
    // Výsledky hráčů ve výzvě, nejlepší první (víc správných, pak víc bodů, pak dřív hotové)
    const getResults = async (code) => {
        const rows = await withExtras(extras => request('GET', `challenge_results?challenge_id=eq.${encodeURIComponent(code)}&select=correct,points,finished_at,user_id,player:profiles!user_id(${profileFields(extras)})`)) || [];
        return rows.sort((a, b) => b.correct - a.correct || b.points - a.points || String(a.finished_at).localeCompare(String(b.finished_at)));
    };
    // První výsledek platí (ignoruje se opakovaný zápis), ať si nejde skóre vylepšit hraním znovu
    // Celé číslo v rozsahu 0..max (NaN, záporné a nesmyslně velké hodnoty by databáze stejně odmítla a výsledek by se ztratil)
    const wholeNumber = (value, max) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0;
    const submitResult = (userId, code, { correct, points }) => request('POST', 'challenge_results?on_conflict=challenge_id,user_id', {
        body: { challenge_id: code, user_id: userId, correct: wholeNumber(correct, 20), points: wholeNumber(points, 80) }, prefer: 'resolution=ignore-duplicates,return=minimal'
    });
    // Moje výzvy, nejnovější první, s mým výsledkem a výsledky ostatních
    const myChallenges = async (userId, limit = 8) => {
        const mine = await withExtras(extras => request('GET', `challenge_results?user_id=eq.${encodeURIComponent(userId)}&select=challenge_id,correct,points,finished_at,challenge:challenges(id,topic,count,creator:profiles!creator_id(${profileFields(extras)}))&order=finished_at.desc&limit=${limit}`)) || [];
        if (!mine.length) return [];
        const ids = mine.map(row => row.challenge_id).join(',');
        const others = await withExtras(extras => request('GET', `challenge_results?challenge_id=in.(${ids})&user_id=neq.${encodeURIComponent(userId)}&select=challenge_id,correct,points,player:profiles!user_id(${profileFields(extras)})`)) || [];
        return mine.map(row => ({ ...row, others: others.filter(other => other.challenge_id === row.challenge_id) }));
    };

    // Úroveň (XP) a odznaky v účtu; sloupce přibyly pozdější verzí schématu, bez nich volající chybu ignoruje
    const getProgress = async (userId) => (await withExtras(extras => request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=xp,badges${extras ? ',title_pref' : ''}`)) || [])[0] || null;
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
    // Jen souvislá řada odpovědí od první otázky (server jinou neuloží): [{ correct, points }]
    const cleanAnswers = (rows, count, maxPoints) => {
        const list = [];
        (Array.isArray(rows) ? rows : []).map(row => ({ idx: Math.floor(Number(row && row.idx)), correct: Boolean(row && row.correct), points: wholeNumber(row && row.points, maxPoints) }))
            .sort((a, b) => a.idx - b.idx)
            .forEach(row => { if (row.idx === list.length && list.length < count) list.push({ correct: row.correct && row.points > 0, points: row.correct ? row.points : 0 }); });
        return list;
    };
    // Kód výzvy tak, jak ho drží databáze (šest znaků A–Z a 0–9)
    const needCode = (code) => { const clean = String(code || ''); if (!/^[A-Z0-9]{6}$/.test(clean)) throw new SocialError('Neplatný kód výzvy.', 400); return clean; };
    const challengeProgress = (userId, code, count = 20) => guardAnswers('challenge', async () => cleanAnswers(
        await request('GET', `challenge_progress?challenge_id=eq.${needCode(code)}&user_id=eq.${encodeURIComponent(userId)}&select=idx,correct,points&order=idx.asc&limit=20`), count, 8));
    // true = uloženo (nebo server stejnou odpověď už měl), null = databáze průběh neeviduje; správná odpověď má vždy aspoň bod (jinak by ji server odmítl)
    const saveChallengeProgress = (code, idx, { correct, points }) => guardAnswers('challenge', async () => {
        await request('POST', 'rpc/challenge_progress_save', { body: { code: needCode(code), idx: wholeNumber(idx, 19), correct: Boolean(correct), points: correct ? Math.max(1, wholeNumber(points, 8)) : 0 } });
        return true;
    });
    const tournamentAnswers = (userId, mid) => guardAnswers('tournament', async () => cleanAnswers(
        await request('GET', `tournament_answers?match_id=eq.${encodeURIComponent(needTournamentId(mid, 'zápas'))}&user_id=eq.${encodeURIComponent(userId)}&select=idx,correct,points&order=idx.asc&limit=10`), 10, 4));
    const saveTournamentAnswer = (mid, idx, { correct, points }) => guardAnswers('tournament', async () => {
        await request('POST', 'rpc/tournament_answer_save', { body: { mid: needTournamentId(mid, 'zápas'), idx: wholeNumber(idx, 9), correct: Boolean(correct), points: correct ? Math.max(1, wholeNumber(points, 4)) : 0 } });
        return true;
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
        const allowed = ['dev_tournament_add_bots', 'dev_tournament_start_now', 'dev_tournament_next_round', 'dev_tournament_clear_bots', 'dev_tournament_reset'];
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
            const diff = own.correct - row.correct || own.points - row.points;
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
    // row = { correct, points, ms }: body za správnou 1–4, za špatnou 0, čas na otázku v ms (server ho ověří)
    const dailyQuizAnswer = (day, idx, row) => guardQuiz(async () => cleanQuizState(await request('POST', 'rpc/daily_quiz_answer', {
        body: { for_day: cleanDay(day), idx: wholeNumber(idx, 9), is_correct: Boolean(row && row.correct), points: row && row.correct ? Math.max(1, wholeNumber(row.points, 4)) : 0, ms: wholeNumber(row && row.ms, 3600000) }
    })));
    const dailyQuizBoard = (day = null, top = 50) => guardQuiz(async () => {
        const data = (await request('POST', 'rpc/daily_quiz_board', { body: { for_day: cleanDay(day), top_n: wholeNumber(top, 100) || 50 } })) || {};
        const me = data.me && typeof data.me === 'object' ? { rank: wholeNumber(data.me.rank, 10000000) || 1, score: wholeNumber(data.me.score, 40), correct: wholeNumber(data.me.correct, 10), time_ms: wholeNumber(data.me.time_ms, 3000000), bitmap: wholeNumber(data.me.bitmap, 1023), answered: wholeNumber(data.me.answered, 10) } : null;
        return { day: cleanDay(data.day), total: wholeNumber(data.total, 10000000), top: (Array.isArray(data.top) ? data.top : []).map(cleanQuizRow), me, streak: wholeNumber(data.streak, 100000), best_streak: wholeNumber(data.best_streak, 100000) };
    });
    const dailyQuizFriends = (day = null) => guardQuiz(async () => {
        const data = (await request('POST', 'rpc/daily_quiz_friends', { body: { for_day: cleanDay(day) } })) || {};
        return { day: cleanDay(data.day), friends: wholeNumber(data.friends, 100000), rows: (Array.isArray(data.rows) ? data.rows : []).map(cleanQuizRow) };
    });
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

    return { AVATARS, allAvatars, cleanColor, customHue, nearestColor, cleanFrame, cleanOwl, saveOwl, cleanTitlePref, saveLook, COLORS, COUNTS, NAME_MAX, SocialError, cleanName, isValidName, newCode, parseCode, getProfile, saveProfile, createChallenge, getChallenge, getResults, submitResult, myChallenges, searchPlayers, randomOpponent, incomingChallenges, playerStats, getProgress, saveProgress, getRating, getRatingChange, weeklyLeaderboard, getAccepts, saveAccepts,
        tournamentTick, getTournaments, inTournament, devTournament, devClientErrors, isDevAdmin, schemaVersion, reportQuestion, getQuestionReports, deleteQuestionReport, exportMyData, deleteMyAccount, getTournamentEntries, getTournamentMatches, joinTournament, leaveTournament, startTournamentMatch, finishTournamentMatch, myTournamentStats, tournamentNotices, tournamentNoticesSeen,
        challengeProgress, saveChallengeProgress, tournamentAnswers, saveTournamentAnswer, claimTournamentXp,
        touchSeen, friendsList, addFriend, acceptFriend, removeFriend, REACTIONS, react, reactionsFor, lastReactionFrom, blockedPlayers, blockPlayer, unblockPlayer, REPORT_REASONS, reportPlayer, devReports, devResolveReport,
        submitAnswerStats, answerStatsTopic, devSuspiciousQuestions,
        // Kvíz dne (schéma 7)
        dailyQuizState, dailyQuizStart, dailyQuizAnswer, dailyQuizBoard, dailyQuizFriends };
});
