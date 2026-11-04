// Denní zajímavost: vybere událost k dnešnímu datu z Wikipedie, dá ji přepsat Gemini do krátkého českého odstavce
// a uloží data/fakt.json (pro všechny hráče stejná). Spouští ji naplánovaný workflow .github/workflows/fakt.yml.
//   GEMINI_API_KEY=… node scripts/daily-fact.mjs [YYYY-MM-DD] [výstupní soubor]
// Zdroj faktů jsou jen texty z Wikipedie; Gemini je smí jen přepsat. Výsledek se ještě zkontroluje (délka, čísla, adresy).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = 'Mudrlant/1.0 (https://github.com/taronwho/geografie-kviz; denní zajímavost)';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// Když zvolený model u API neexistuje (404), zkusí se starší, ať denní zajímavost nevypadne
const FALLBACK_MODEL = 'gemini-2.5-flash';
const TEXT_MIN = 120;
const TEXT_MAX = 650;

// Dnešní datum v Praze (YYYY-MM-DD)
export const pragueDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const hash = (text) => { let h = 2166136261; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const getJson = async (fetchImpl, url, init = {}, tries = 3) => {
    let last = null;
    for (let attempt = 0; attempt < tries; attempt++) {
        try {
            const response = await fetchImpl(url, { ...init, headers: { 'User-Agent': UA, 'Api-User-Agent': UA, ...(init.headers || {}) } });
            if (response.ok) return await response.json();
            last = new Error(`${response.status} ${url.split('?')[0]}`);
            if (response.status !== 429 && response.status < 500) break;
        } catch (error) { last = error; }
        await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
    throw last;
};

// Kandidáti na dnešní den: vybrané události, ostatní události a narození; každý má rok, text a anglickou stránku
export const candidatesFor = (feed, day) => {
    const seen = new Set();
    const out = [];
    for (const kind of ['selected', 'events', 'births']) {
        for (const item of feed[kind] || []) {
            const page = (item.pages || []).find(entry => entry && entry.title && entry.type === 'standard');
            if (!page || !item.text || !Number.isInteger(item.year) || seen.has(page.title)) continue;
            seen.add(page.title);
            out.push({ kind, year: item.year, text: item.text, title: page.title });
        }
    }
    // Pořadí podle data, ať je výběr stejný při opakování, ale každý den jiný
    const start = out.length ? hash(day) % out.length : 0;
    return out.slice(start).concat(out.slice(0, start));
};

// České heslo a úvod k anglické stránce; bez české stránky se kandidát nepoužije (odkaz vede na českou Wikipedii)
const czechArticle = async (fetchImpl, enTitle) => {
    const query = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=cs&redirects=1&format=json&titles=${encodeURIComponent(enTitle)}`;
    const data = await getJson(fetchImpl, query);
    const page = Object.values((data.query && data.query.pages) || {})[0];
    const link = page && page.langlinks && page.langlinks[0];
    const csTitle = link && (link['*'] || link.title);
    if (!csTitle) return null;
    const summary = await getJson(fetchImpl, `https://cs.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(csTitle.replace(/ /g, '_'))}`);
    if (!summary.extract || summary.extract.length < 80) return null;
    return { title: summary.title || csTitle, extract: summary.extract, url: (summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page) || `https://cs.wikipedia.org/wiki/${encodeURIComponent(csTitle.replace(/ /g, '_'))}` };
};

const yearsAgo = (day, candidate) => Number(day.slice(0, 4)) - candidate.year;

const prompt = (day, candidate, article) => `Jsi redaktor české vzdělávací aplikace. Napiš krátkou zajímavost ke dni ${day.slice(8)}. ${Number(day.slice(5, 7))}. podle zdrojů níže.

Pravidla:
- Piš česky, stručně a poutavě, jedním odstavcem o 2 až 4 větách (asi 250 až 450 znaků).
- Použij POUZE fakta ze zdrojů. Nic nepřidávej z paměti, žádná jiná čísla ani jména, než jsou ve zdrojích.
- Zajímavost je ke dni ${Number(day.slice(8))}. ${Number(day.slice(5, 7))}.: v první větě zmiň, že se to stalo přesně v tento den, a rok (je to ${yearsAgo(day, candidate)} let zpět, můžeš napsat „přesně před ${yearsAgo(day, candidate)} lety“). Žádné markdown, odrážky, emoji ani odkazy.
- Přidej krátký titulek (nejvýše 60 znaků) bez tečky na konci.
Vrať JSON {"title": "...", "text": "..."}.

Událost (rok ${candidate.year}, anglicky): ${candidate.text}

Česká Wikipedie, ${article.title}: ${article.extract}`;

const numbers = (text) => (String(text).match(/\d+/g) || []).map(Number);

// Kontrola odpovědi: tvar, délka, žádné adresy a každé číslo musí být ve zdrojích (obrana proti vymyšleným datům)
export const validateFact = (fact, sources) => {
    if (!fact || typeof fact.title !== 'string' || typeof fact.text !== 'string') return 'chybí titulek nebo text';
    const title = fact.title.trim();
    const text = fact.text.trim();
    if (title.length < 3 || title.length > 70) return 'titulek má špatnou délku';
    if (text.length < TEXT_MIN || text.length > TEXT_MAX) return `text má ${text.length} znaků`;
    if (/https?:|www\.|[*#_`<>]/.test(`${title} ${text}`)) return 'text obsahuje adresu nebo formátování';
    const allowed = new Set(numbers(sources));
    const stray = numbers(`${title} ${text}`).filter(number => !allowed.has(number));
    if (stray.length) return `čísla mimo zdroje: ${stray.join(', ')}`;
    return null;
};

const askGemini = async (fetchImpl, key, text) => {
    const body = {
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json',
            responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['title', 'text'] }
        }
    };
    const call = (model) => getJson(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }, 1);
    let data;
    try { data = await call(MODEL); } catch (error) {
        if (!/^404 /.test(error.message) || MODEL === FALLBACK_MODEL) throw error;
        data = await call(FALLBACK_MODEL);
    }
    const raw = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(part => part.text || '').join('');
    if (!raw) throw new Error('Gemini nevrátilo text');
    return JSON.parse(raw);
};

export const buildFact = async ({ day, key, fetchImpl = fetch, log = () => {} }) => {
    const [, month, date] = day.split('-');
    const feed = await getJson(fetchImpl, `https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${month}/${date}`);
    const candidates = candidatesFor(feed, day);
    if (!candidates.length) throw new Error('Wikipedie nevrátila žádné události');
    let tried = 0;
    for (const candidate of candidates) {
        if (tried >= 12) break;
        let article;
        try { article = await czechArticle(fetchImpl, candidate.title); } catch (error) { log(`${candidate.title}: ${error.message}`); continue; }
        if (!article) { log(`${candidate.title}: bez české stránky`); continue; }
        tried += 1;
        for (let attempt = 0; attempt < 2; attempt++) {
            let fact;
            try { fact = await askGemini(fetchImpl, key, prompt(day, candidate, article)); } catch (error) { log(`Gemini: ${error.message}`); continue; }
            const problem = validateFact(fact, `${candidate.text} ${article.extract} ${candidate.year} ${day} ${yearsAgo(day, candidate)}`);
            if (!problem) return { date: day, year: candidate.year, title: fact.title.trim(), text: fact.text.trim(), url: article.url, page: article.title, source: 'Wikipedie' };
            log(`${candidate.title}: ${problem}`);
        }
    }
    throw new Error('Nepodařilo se vytvořit zajímavost');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) { console.error('Chybí GEMINI_API_KEY'); process.exit(1); }
    const day = process.argv[2] || pragueDay();
    const out = process.argv[3] || 'data/fakt.json';
    buildFact({ day, key, log: (line) => console.error(line) }).then(fact => {
        writeFileSync(out, `${JSON.stringify(fact, null, 2)}\n`);
        console.log(`${fact.date}: ${fact.title} (${fact.page})`);
    }).catch(error => { console.error(error.message); process.exit(1); });
}
