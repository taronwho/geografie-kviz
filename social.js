// Profil hráče a výzvy (Supabase REST přes pravidla řádků). Všechno vyžaduje přihlášení (auth.js).
// Výzva = téma (nebo mix), semínko a počet otázek; otázky se z něj losují stejně všem hráčům, takže stačí sdílet kód.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantSocial = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    // Obrázek profilu: emoji a barva (bez nahrávání fotek – bez moderace a bez cizích adres v CSP)
    const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐵', '🦁', '🐨', '🐧', '🦋', '🐢', '🐬', '🦖', '🐝', '🦔', '🐺', '🦅', '🐳', '🐰', '🐱', '🐶', '🦦'];
    const COLORS = ['emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'orange', 'indigo'];
    const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const COUNTS = [5, 10, 15];
    const NAME_MAX = 24;

    const config = () => root.MUDRLANT_CONFIG || {};
    const baseUrl = () => String(config().supabaseUrl || '').replace(/\/+$/, '');
    const auth = () => root.MudrlantAuth;

    class SocialError extends Error {
        constructor(message, status) { super(message); this.status = status; }
    }

    const request = async (method, path, { body, prefer } = {}) => {
        const token = await auth().accessToken();
        if (!token) throw new SocialError('Nejsi přihlášený.', 401);
        const response = await fetch(`${baseUrl()}/rest/v1/${path}`, {
            method,
            headers: { apikey: config().supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
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

    const PROFILE_FIELDS = 'id,display_name,avatar,color';
    const getProfile = async (userId) => (await request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=${PROFILE_FIELDS}`) || [])[0] || null;
    const saveProfile = async (userId, { name, avatar, color }) => {
        const patch = { display_name: cleanName(name), avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0], color: COLORS.includes(color) ? color : COLORS[0] };
        if (!isValidName(patch.display_name)) throw new SocialError('Přezdívka má mít 2 až 24 znaků: písmena, číslice, mezeru, tečku, podtržítko nebo pomlčku.', 400);
        let rows;
        try {
            rows = await request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body: patch, prefer: 'return=representation' });
        } catch (error) {
            // Přezdívka je jedinečná: databáze odmítne tu, kterou už někdo má
            if (error.status === 409) throw new SocialError('Tuhle přezdívku už má jiný hráč.', 409);
            throw error;
        }
        return rows && rows[0] ? rows[0] : { id: userId, ...patch };
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
    const getChallenge = async (code) => (await request('GET', `challenges?id=eq.${encodeURIComponent(code)}&select=id,topic,seed,count,created_at,include_hard,categories,variant,creator:profiles!creator_id(${PROFILE_FIELDS}),invited:profiles!invited_id(${PROFILE_FIELDS})`) || [])[0] || null;
    // Výsledky hráčů ve výzvě, nejlepší první (víc správných, pak víc bodů, pak dřív hotové)
    const getResults = async (code) => {
        const rows = await request('GET', `challenge_results?challenge_id=eq.${encodeURIComponent(code)}&select=correct,points,finished_at,user_id,player:profiles!user_id(${PROFILE_FIELDS})`) || [];
        return rows.sort((a, b) => b.correct - a.correct || b.points - a.points || String(a.finished_at).localeCompare(String(b.finished_at)));
    };
    // První výsledek platí (ignoruje se opakovaný zápis), ať si nejde skóre vylepšit hraním znovu
    const submitResult = (userId, code, { correct, points }) => request('POST', 'challenge_results?on_conflict=challenge_id,user_id', {
        body: { challenge_id: code, user_id: userId, correct, points }, prefer: 'resolution=ignore-duplicates,return=minimal'
    });
    // Moje výzvy, nejnovější první, s mým výsledkem a výsledky ostatních
    const myChallenges = async (userId, limit = 8) => {
        const mine = await request('GET', `challenge_results?user_id=eq.${encodeURIComponent(userId)}&select=challenge_id,correct,points,finished_at,challenge:challenges(id,topic,count,creator:profiles!creator_id(${PROFILE_FIELDS}))&order=finished_at.desc&limit=${limit}`) || [];
        if (!mine.length) return [];
        const ids = mine.map(row => row.challenge_id).join(',');
        const others = await request('GET', `challenge_results?challenge_id=in.(${ids})&user_id=neq.${encodeURIComponent(userId)}&select=challenge_id,correct,points,player:profiles!user_id(${PROFILE_FIELDS})`) || [];
        return mine.map(row => ({ ...row, others: others.filter(other => other.challenge_id === row.challenge_id) }));
    };

    // Úroveň (XP) a odznaky v účtu; sloupce přibyly pozdější verzí schématu, bez nich volající chybu ignoruje
    const getProgress = async (userId) => (await request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=xp,badges`) || [])[0] || null;
    const saveProgress = (userId, { xp, badges }) => request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, {
        body: { xp: Math.max(0, Math.min(1000000, Math.floor(xp))), badges: badges.slice(0, 60) }, prefer: 'return=minimal'
    });

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

    // Hledání hráčů podle přezdívky (část jména, na velikosti písmen nezáleží), bez mě
    const searchPlayers = async (userId, query) => {
        const term = String(query || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, NAME_MAX);
        if (term.length < 2) return [];
        return await request('GET', `profiles?display_name=ilike.${encodeURIComponent(`*${term}*`)}&id=neq.${encodeURIComponent(userId)}&select=${PROFILE_FIELDS}&order=display_name&limit=8`) || [];
    };
    // Náhodný jiný hráč (funkce v databázi); null, když tu zatím nikdo další není
    // wanted = témata výzvy (hráč, který je nepřijímá, se přeskočí); starší databáze bez parametru volá funkci bez něj
    const randomOpponent = async (wanted = []) => {
        let rows;
        try {
            rows = await request('POST', 'rpc/random_opponent', { body: { wanted } });
        } catch (error) {
            if (error.status !== 404 && error.status !== 400) throw error;
            rows = await request('POST', 'rpc/random_opponent', { body: {} });
        }
        return (rows || [])[0] || null;
    };
    // Témata, ze kterých hráč nepřijímá výzvy; bez sloupce v databázi (starší schéma) nic nebrání
    const getBlocked = async (userId) => {
        try {
            const row = (await request('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=blocked_topics`) || [])[0];
            return row && Array.isArray(row.blocked_topics) ? row.blocked_topics : [];
        } catch (error) {
            return [];
        }
    };
    const saveBlocked = (userId, topics) => request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body: { blocked_topics: [...new Set(topics)].slice(0, 30) }, prefer: 'return=minimal' });
    // Výzvy pro mě, které jsem ještě nehrál, nejnovější první
    const incomingChallenges = async (userId, limit = 10) => {
        const invites = await request('GET', `challenges?invited_id=eq.${encodeURIComponent(userId)}&select=id,topic,count,created_at,creator:profiles!creator_id(${PROFILE_FIELDS})&order=created_at.desc&limit=${limit}`) || [];
        if (!invites.length) return [];
        const ids = invites.map(row => row.id).join(',');
        const played = await request('GET', `challenge_results?user_id=eq.${encodeURIComponent(userId)}&challenge_id=in.(${ids})&select=challenge_id`) || [];
        const done = new Set(played.map(row => row.challenge_id));
        return invites.filter(row => !done.has(row.id));
    };

    return { AVATARS, COLORS, COUNTS, NAME_MAX, SocialError, cleanName, isValidName, newCode, parseCode, getProfile, saveProfile, createChallenge, getChallenge, getResults, submitResult, myChallenges, searchPlayers, randomOpponent, incomingChallenges, playerStats, getProgress, saveProgress, getBlocked, saveBlocked };
});
