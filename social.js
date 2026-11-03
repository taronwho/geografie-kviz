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
        if (!response.ok) throw new SocialError(`Server odpověděl ${response.status}`, response.status);
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    };

    const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
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
        if (!patch.display_name) throw new SocialError('Jméno nesmí být prázdné.', 400);
        const rows = await request('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { body: patch, prefer: 'return=representation' });
        return rows && rows[0] ? rows[0] : { id: userId, ...patch };
    };

    // Založí výzvu a vrátí ji (kód vybírá klient; při srážce s existujícím kódem zkusí jiný)
    const createChallenge = async (userId, { topic, count }) => {
        if (!COUNTS.includes(count)) throw new SocialError('Neplatný počet otázek.', 400);
        for (let attempt = 0; attempt < 4; attempt++) {
            const id = newCode();
            try {
                const rows = await request('POST', 'challenges', { body: { id, creator_id: userId, topic, seed: `vyzva-${id}-${Date.now().toString(36)}`, count }, prefer: 'return=representation' });
                return rows[0];
            } catch (error) {
                if (error.status !== 409) throw error;
            }
        }
        throw new SocialError('Výzvu se nepodařilo založit.', 409);
    };
    const getChallenge = async (code) => (await request('GET', `challenges?id=eq.${encodeURIComponent(code)}&select=id,topic,seed,count,created_at,creator:profiles!creator_id(${PROFILE_FIELDS})`) || [])[0] || null;
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

    return { AVATARS, COLORS, COUNTS, NAME_MAX, SocialError, cleanName, newCode, parseCode, getProfile, saveProfile, createChallenge, getChallenge, getResults, submitResult, myChallenges };
});
