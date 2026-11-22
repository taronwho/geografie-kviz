#!/usr/bin/env node
// Audit jednoznačnosti otázek: npm run audit:jednoznacnost [-- --per-level=60 --days=40 --challenges=12 --conquest=24 --wiki=uvody.json --fetch
//   --topic=film,historie --out=reports/jednoznacnost.md --json=reports/jednoznacnost.json]
//
// Vygeneruje tisíce otázek tak, jak je staví hra (scripts/lib/jednoznacnost.mjs: stejné funkce jádra jako app.js createRoundData),
// ve všech tématech a druzích otázek, na všech úrovních obtížnosti (známé, Mudrlant, Expert) a ve čtyřech hrách: hlavní hra
// (každý druh otázky, který téma pro položku umí), Kvíz dne (plán dne daily-quiz.js a semínko otázky), výzvy (položka a otázka ze
// semínka výzvy) a Dobývání (conquest.js buildQuestion s pevnými nesprávnými možnostmi a completeQuestion). U každé otázky posoudí
// stav před úpravou a po ní: určí to, co hráč vidí bez nápovědy (zakrytý popis, fakta ukázaná hned, rozlišující údaj, obrázek
// otázky), odpověď mezi čtyřmi možnostmi? Výstup: reports/jednoznacnost.md (souhrn s příklady) a reports/jednoznacnost.json.
//
// Popis otázky je úvod článku z Wikipedie, jak ho načte hra: tests/wiki-intros.json a --wiki=soubor (stejný tvar), u ostatních
// položek krátký popis z Wikidat (jako při výpadku Wikipedie). --fetch doplní do souboru --wiki úvody položek, které audit
// potřebuje (cs.wikipedia.org, stejný dotaz jako aplikace, 20 článků na dotaz). Exit kód je nenulový, když po úpravě zůstane
// nejednoznačná otázka, která není vysvětlená (ambiguous: hra ji v tréninku nahradí jinou položkou).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { core } from './lib/audit.mjs';
import { TOPIC_IDS, DailyQuiz, Conquest, loadIntros, fetchedTextOf, contextOf, questionFromRng, assemble, evaluate, swapQuality } from './lib/jednoznacnost.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const topics = args.topic ? args.topic.split(',').filter(id => TOPIC_IDS.includes(id)) : TOPIC_IDS;
const PER_LEVEL = Number(args['per-level'] || 60);
const DAYS = Number(args.days || 40);
const CHALLENGES = Number(args.challenges || 12);
const CONQUEST = Number(args.conquest || 24);
const FIRST_DAY = args.from || '2026-11-17';
const out = path.resolve(ROOT, args.out || 'reports/jednoznacnost.md');
const jsonOut = path.resolve(ROOT, args.json || 'reports/jednoznacnost.json');
const wikiFile = args.wiki ? path.resolve(args.wiki) : null;
const started = Date.now();
const log = (text) => { if (args.quiet !== 'true') process.stderr.write(`${text}\n`); };

// --- Generátory: { generator, topic, level, item, build: (after) => { round, evaluation } } ---
const TOPIC_GROUPS = [['zemepis', 'vlajky', 'historie', 'mytologie'], ['biologie', 'geologie', 'chemie', 'fyzika'], ['umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport', 'jidlo']];
const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
const evenly = (list, count) => (list.length <= count ? list : Array.from({ length: count }, (_, i) => list[Math.floor(i * list.length / count)]));
const ROLLS = [0.05, 0.22, 0.28, 0.33, 0.42, 0.55, 0.78, 0.9];
// Generátor, který prvním voláním vrátí zvolený hod (druh otázky), dál běží ze semínka
const rollThen = (roll, seed) => { const seeded = core.createSeededRandom(seed); let first = true; return () => { if (first) { first = false; return roll; } return seeded(); }; };

const jobs = [];
// Hlavní hra: každý druh otázky, který téma pro položku umí (hody pokryjí všechny větve specialQuestion), na každé úrovni
const mainJobs = (topicId) => {
    const ctx = contextOf(topicId);
    for (const level of [1, 2, 3]) {
        const items = evenly(ctx.items.filter(item => !item.nq && core.levelOf(item) === level), PER_LEVEL);
        for (const item of items) {
            const seen = new Set();
            let plain = !ctx.topic.specialQuestion;
            for (const roll of ctx.topic.specialQuestion ? ROLLS : []) {
                const special = ctx.topic.specialQuestion(item, ctx, rollThen(roll, `jedno:${topicId}:${item.q}:${roll}`));
                if (!special) { plain = true; continue; }
                const key = `${special.type}|${special.title}`;
                if (seen.has(key)) continue;
                seen.add(key);
                jobs.push({ generator: 'hra', topic: topicId, level, item, make: () => ({ question: special, special: true, rng: core.createSeededRandom(`jedno:${item.q}:${key}`) }) });
            }
            if (plain) jobs.push({ generator: 'hra', topic: topicId, level, item, make: () => { const rng = core.createSeededRandom(`jedno:${topicId}:${item.q}:nazev`); return { ...questionFromRng(item, ctx, rng, { plain: true }), rng }; } });
        }
    }
};
// Kvíz dne: plán dne (daily-quiz.js planDay) a otázka ze semínka otázky; denní módy mění možnosti od prvního dne auditu
const quizJobs = () => {
    const groups = TOPIC_GROUPS.map(group => group.filter(id => TOPIC_IDS.includes(id)));
    const dataOf = (id) => { const ctx = contextOf(id); return { items: ctx.items, categories: ctx.topic.categories.map(category => category.key) }; };
    for (let d = 0; d < DAYS; d++) {
        const day = addDays(FIRST_DAY, d);
        for (const slot of DailyQuiz.planDay(day, groups, dataOf)) {
            if (!slot.q || !topics.includes(slot.topic)) continue;
            const ctx = contextOf(slot.topic);
            const item = ctx.byId.get(slot.q);
            if (!item) continue;
            jobs.push({ generator: 'kvíz dne', topic: slot.topic, level: core.levelOf(item), item, day, make: () => { const rng = core.createSeededRandom(DailyQuiz.questionSeed(day, slot.slot)); return { ...questionFromRng(item, ctx, rng), rng }; } });
        }
    }
};
// Výzvy: položka z okruhu podle úrovně (pickItem ze semínka) a otázka ze stejného semínka
const challengeJobs = (topicId) => {
    const ctx = contextOf(topicId);
    const categories = ctx.topic.categories.map(category => category.key);
    for (const tier of ['known', 'all', 'expert']) {
        const items = core.filterItems(ctx.items, { tier });
        for (let n = 0; n < CHALLENGES; n++) {
            const seed = `vyzva|${topicId}|${tier}|${n}`;
            const item = core.pickItem(items, core.createSeededRandom(seed), [], categories);
            if (!item) continue;
            // Položka i otázka z jednoho semínka (stejně jako výzva): pro každé sestavení znovu od začátku
            jobs.push({ generator: 'výzva', topic: topicId, level: core.levelOf(item), item, make: () => {
                const rng = core.createSeededRandom(seed);
                core.pickItem(items, rng, [], categories);
                return { ...questionFromRng(item, ctx, rng), rng };
            } });
        }
    }
};
// Dobývání: otázka Mudrlanta o položce území (formy popis a fakta) s pevnými nesprávnými možnostmi, doplněná jako app.js conquestRound
const CONQUEST_TOPICS = ['zemepis', 'vlajky', 'architektura', 'historie', 'literatura', 'hudba', 'umeni', 'film', 'sport', 'fyzika', 'chemie', 'biologie', 'mytologie'];
const conquestJobs = () => {
    const pools = Object.fromEntries(CONQUEST_TOPICS.map(id => [id, contextOf(id).items]));
    for (const mapId of ['evropa', 'cesko', 'asie', 'afrika', 'amerika']) {
        const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `dobyvani-${mapId}.json`), 'utf8'));
        for (const territory of evenly(data.t.filter(entry => !entry.sea), CONQUEST)) {
            for (const level of [0, 1, 2, 3]) {
                for (const form of ['text', 'facts']) {
                    const seed = `jedno|${mapId}|${level}`;
                    const pending = Conquest.buildQuestion({ data, territory: territory.id, level, topics: pools, seed, only: form });
                    if (!pending || !pending.pending || !pending.request || !topics.includes(pending.request.topic)) continue;
                    const ctx = contextOf(pending.request.topic);
                    const item = ctx.byId.get(pending.request.q);
                    const wrong = pending.request.wrong.map(id => ctx.byId.get(id));
                    if (!item || wrong.some(other => !other)) continue;
                    jobs.push({ generator: 'Dobývání', topic: pending.request.topic, level: core.levelOf(item), item, conquest: { pending, form },
                        make: () => { const rng = core.createSeededRandom(`dobyvani|${seed}|${territory.id}`); return { ...questionFromRng(item, ctx, rng, { wrong }), rng }; } });
                }
            }
        }
    }
};
for (const topicId of topics) { mainJobs(topicId); challengeJobs(topicId); }
quizJobs();
conquestJobs();
log(`Otázek k posouzení: ${jobs.length} (${[...new Set(jobs.map(job => job.generator))].map(name => `${name} ${jobs.filter(job => job.generator === name).length}`).join(', ')})`);

// --- Úvody článků: --fetch doplní chybějící ---
const fetchIntros = async (file) => {
    const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { source: 'cs.wikipedia.org – úvody článků (CC BY-SA 4.0), stejný dotaz jako v aplikaci', items: {} };
    const have = loadIntros([file]);
    const wanted = new Map();
    for (const job of jobs) { const key = `${job.topic}:${job.item.q}`; if (!have.has(key) && !(key in cache.items)) wanted.set(key, job.item.t); }
    const keys = [...wanted.keys()];
    log(`Úvody ke stažení: ${keys.length}`);
    for (let i = 0; i < keys.length; i += 20) {
        const batch = keys.slice(i, i + 20);
        const titles = batch.map(key => wanted.get(key));
        const url = `https://cs.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=1&explaintext=1&exchars=1200&exlimit=20&redirects=1&titles=${encodeURIComponent(titles.join('|'))}`;
        let json = null;
        for (let attempt = 0; attempt < 4 && !json; attempt++) {
            try {
                const response = await fetch(url, { headers: { 'User-Agent': 'MudrlantAudit/1.0 (audit jednoznacnosti otazek)' } });
                if (response.ok) json = await response.json();
                else await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)));
            } catch (error) { await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1))); }
        }
        if (!json) { log(`  dávka ${i / 20 + 1} se nestáhla`); continue; }
        const rename = new Map([...(json.query.normalized || []), ...(json.query.redirects || [])].map(entry => [entry.from, entry.to]));
        const resolve = (title) => { let current = title; for (let n = 0; n < 3 && rename.has(current); n++) current = rename.get(current); return current; };
        const pages = new Map(Object.values(json.query.pages || {}).map(page => [page.title, page.extract || '']));
        batch.forEach((key, index) => { const extract = pages.get(resolve(titles[index])); cache.items[key] = { t: titles[index], extract: extract || '' }; });
        if ((i / 20) % 10 === 9) fs.writeFileSync(file, JSON.stringify(cache));
        await new Promise(resolve => setTimeout(resolve, 1200));
    }
    cache.generated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(file, JSON.stringify(cache));
};
if (args.fetch === 'true') {
    if (!wikiFile) throw new Error('--fetch potřebuje --wiki=soubor');
    await fetchIntros(wikiFile);
}
const intros = loadIntros(wikiFile ? [wikiFile] : []);

// --- Posouzení ---
const clip = (text, length = 260) => { const value = String(text || '').replace(/\s+/g, ' ').trim(); return value.length > length ? `${value.slice(0, length - 1)}…` : value; };
const labelsOf = (question) => (question.choices || []).map(choice => `${choice.label}${choice.correct ? ' ✓' : ''}`);
// Obsah otázky Dobývání jako app.js conquestRound a conquest.js completeQuestion
const conquestContent = (round, ctx, form, pending, after) => {
    const factsOf = (plan) => [...(plan.leadFacts || []), ...plan.hints.filter(hint => hint.kind === 'facts').flatMap(hint => hint.facts)];
    const facts = form === 'facts' ? factsOf(core.planRound({ item: round.item, ctx, question: round.question, texts: { questionText: '', moreText: '', origin: 'withheld' }, typeLabel: round.typeLabel,
        describeVisual: () => null, photoMasks: ctx.photoMasks || {}, textPhotos: ctx.textPhotos || new Set(), unique: after })) : factsOf(round.plan);
    const excerpt = (round.plan.hints.find(hint => hint.kind === 'excerpt') || {}).text || '';
    const words = (value) => String(value || '').replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}{2,}/u.test(word)).length;
    const text = round.texts.questionText && excerpt && round.texts.origin === 'article' && words(round.texts.questionText) < core.MIN_DESCRIPTION_WORDS ? `${round.texts.questionText} ${excerpt}` : round.texts.questionText || '';
    const unique = after ? core.uniqueInfo({ item: round.item, ctx, question: round.question, text, facts }) : null;
    const data = { text, origin: round.texts.origin, facts: unique ? facts.map((fact, i) => ({ ...fact, excludes: unique.facts[i] })) : facts, typeLabel: round.typeLabel, image: null,
        ...(unique ? { unique: { wrong: unique.wrong, text: unique.text, clues: unique.clues } } : {}) };
    return Conquest.completeQuestion(pending, data);
};
const results = [];
let done = 0;
for (const job of jobs) {
    if (args.trace === 'true') process.stderr.write(`${done} ${job.generator} ${job.topic} ${job.item.n}\n`);
    const ctx = contextOf(job.topic);
    const fetched = fetchedTextOf(job.topic, job.item, intros);
    const states = {};
    for (const after of [false, true]) {
        const made = job.make();
        const swaps = job.generator !== 'Dobývání';
        // Kvíz dne od 17. 11. 2026 se stabilními možnostmi (jen podle dat), výzvy mění možnosti jen podle krátkého popisu
        const round = assemble({ item: job.item, ctx, question: made.question, special: made.special, fetched, after, fixed: job.generator === 'Dobývání', swaps, rng: made.rng,
            plain: job.generator === 'Dobývání', stableChoices: job.generator === 'kvíz dne', stableSwaps: job.generator === 'výzva' });
        let evaluation;
        let content = null;
        if (job.conquest) {
            // Popis či fakta, které sedí na nesprávnou možnost, Dobývání vzdá (conquestRound vrátí null): místní otázka
            const conflicted = [round.texts.questionText, round.texts.moreText].some(text => text && round.question.choices.some(choice => core.choiceConflict(choice, { question: round.question, item: job.item, ctx, text })));
            content = conflicted ? null : conquestContent(round, ctx, job.conquest.form, job.conquest.pending, after);
            evaluation = !content ? { kind: 'místní', ok: true, strict: true, open: [] }
                : evaluate(round, ctx, { text: [content.content.type, content.content.text].filter(Boolean).join(' · '), facts: [...(content.content.clue || []), ...(content.content.facts || [])] });
        } else evaluation = evaluate(round, ctx);
        states[after ? 'after' : 'before'] = { round, evaluation, content };
    }
    const { before, after } = states;
    const view = (state) => ({
        choices: labelsOf(state.round.question),
        text: clip(state.content ? state.content.content.text : state.round.shown ? '' : state.round.texts.questionText),
        facts: state.content ? (state.content.content.facts || []).map(fact => `${fact.label}: ${fact.value}`) : (state.round.plan.leadFacts || []).map(fact => `${fact.label}: ${fact.value}`),
        clue: (state.content ? state.content.content.clue || [] : state.round.plan.clue || []).map(fact => `${fact.label}: ${fact.value}`),
        ok: state.evaluation.ok, strict: state.evaluation.strict, open: state.evaluation.open, via: state.evaluation.via || state.evaluation.kind,
        definition: Boolean(state.evaluation.definition)
    });
    const entry = {
        generator: job.generator, topic: job.topic, level: job.level, q: job.item.q, name: job.item.n, type: after.round.question.type, title: after.round.question.title,
        kind: after.evaluation.kind, wiki: !fetched.fallback, swapped: after.round.swapped, converted: after.round.converted, ambiguous: after.round.ambiguous, day: job.day || null,
        swaps: (after.round.swaps || []).map(swap => swapQuality(job.item, swap.from, swap.to, ctx)).filter(Boolean),
        before: view(before), after: view(after)
    };
    results.push(entry);
    done += 1;
    if (done % 500 === 0) log(`  ${done}/${jobs.length} (${Math.round((Date.now() - started) / 1000)} s)`);
}

// --- Souhrn ---
const judged = results.filter(entry => ['popis', 'ukázka', 'jméno'].includes(entry.kind));
const share = (list, test) => (list.length ? `${(100 * list.filter(test).length / list.length).toFixed(1)} %` : '–');
const count = (list, test) => list.filter(test).length;
const groupBy = (list, keyOf) => list.reduce((map, entry) => { const key = keyOf(entry); if (!map.has(key)) map.set(key, []); map.get(key).push(entry); return map; }, new Map());
// Po úpravě nejednoznačná = nic z toho, co hráč vidí, nevyvrací některou nesprávnou možnost, a odpověď neurčí ani plný úvod článku,
// který data ověřit neumějí (definice pojmu, dinosaurus „z Antarktidy, objevený 1991“)
const stillOpen = (entry) => !entry.after.ok && !entry.after.definition;
const row = (label, list) => `| ${label} | ${list.length} | ${count(list, entry => !entry.before.ok)} | ${share(list, entry => !entry.before.ok)} | ${count(list, stillOpen)} | ${share(list, stillOpen)} | ${count(list, entry => entry.after.definition)} | ${count(list, entry => entry.after.clue.length)} | ${count(list, entry => entry.after.clue.length > 1)} | ${count(list, entry => entry.swapped)} | ${share(list, entry => entry.swapped)} | ${count(list, entry => (entry.swaps || []).some(swap => !swap.similar))} | ${count(list, entry => entry.converted)} |`;
const header = ['| | Otázek | Před: nejednoznačné | Před | Po: nejednoznačné | Po | Po: jen popis | S rozlišujícím údajem | z toho dva údaje | Vyměněné možnosti | Podíl výměn | Výměna mimo skupinu | Otázka se jménem |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
const lines = ['# Jednoznačnost otázek', ''];
const wikiCount = results.filter(entry => entry.wiki).length;
lines.push(`Vygenerováno ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC skriptem \`npm run audit:jednoznacnost\` (${results.length} otázek, ${Math.round((Date.now() - started) / 1000)} s). Úplný výpis je v \`${path.relative(ROOT, jsonOut)}\`.`);
lines.push('', `Popis otázky: úvod článku z Wikipedie u ${wikiCount} otázek (tests/wiki-intros.json${wikiFile ? ` a ${path.basename(wikiFile)}, stažené z cs.wikipedia.org volbou --fetch stejným dotazem jako aplikace` : ''}), u ostatních krátký popis z Wikidat, jako když se Wikipedie nenačte.`);
lines.push('', '## Pravidlo', '', 'Před první nápovědou musí otázka ukázat aspoň jeden údaj, který platí pro správnou odpověď a pro žádnou ze tří nesprávných. Posuzuje se, co hráč vidí bez nápovědy: zadání a štítek, zakrytý popis, fakta ukázaná hned u chudého popisu, rozlišující údaj a obrázek otázky. Nesprávná možnost je vyvrácená, když má v datech některý ukázaný údaj jasně jinak (rok o 10 a víc let u novověku, u starších dob víc; funkční období a doba trvání bez překryvu; číslo aspoň 1,5×; jiný stát nebo třída; dílo, které v jejích datech není a v jehož datech není ona). Z volného textu se počítá jen údaj z dat správné odpovědi, který text zmiňuje (rok, číslo, název díla, místo, národnost). Otázka je nejednoznačná, když některou nesprávnou možnost nevyvrací nic.');
lines.push('', 'Druhy otázek: **popis** = otázka na název bez obrázku (posuzuje se strukturovaně), **ukázka** = obrázek jen ukazuje druh (nerost, hornina, sloh), posuzuje se jako popis; **jméno** = zvláštní otázka se jménem položky (Kdo film režíroval?, Ve kterém století?): odpověď určí jméno, nejednoznačná je, jen když ji v datech splňuje i nesprávná možnost (spolurežisér). Otázky s obrázkem věci samé (obraz, vlajka, stavba), mapové a místní otázky Dobývání se nepočítají.');
lines.push('', '## Úprava (stav „po“)', '', [
    '1. **Prodloužení popisu:** obecný popis (jen povolání či druh, bez roku, čísla, jména a názvu díla) převezme další věty úvodu, dokud v něm konkrétní údaj nebude; převzaté věty v nápovědě Další věty už nejsou.',
    '2. **Rozlišující údaj:** když popis a fakta ukázaná hned odpověď neurčí, ukáže se hned pod záložkami údaj z dat, který všechny nevyvrácené možnosti vyvrací: dílo či role („Film: Císařův pekař – Pekařův císař“), roky (jen jasně jiné), místo, ocenění, autor, sloh, velikost, země. Nikdy jméno ani nic, co odpověď obsahuje (stejné kontroly jako fakta: factRevealsAnswer, answerWordsLeft). Nápověda Fakta ho už neopakuje.',
    '3. **Dva údaje spolu:** když jeden údaj nevyvrátí všechny tři, ukážou se dva, z nichž každý vyvrací část (například rok narození a země).',
    '4. **Výměna jedné možnosti:** teprve když ani dva údaje nestačí a nevyvrácená zbývá jediná možnost, vymění se za co nejpodobnější položku stejného druhu, pohlaví a skupiny (třída, řád, čeleď, sport, mytologie, skupina prvků, stát, kontinent, jednotka, sloh, směr…) a okruhu, kterou vyvrací jemnější ukázaný údaj (rok, číslo, dílo, rodiče) – skupina sama ne, takže otázka zůstane stejně těžká. Výzvy a denní módy rozhodují o výměně jen podle dat a krátkého popisu z Wikidat, takže mají všichni hráči stejné možnosti.',
    '5. **Otázka se jménem, nebo víc výměn:** když by se musely vyměnit dvě nebo tři možnosti, položka se radši zeptá jinou otázkou tématu se svým jménem (Do kterého řádu patří?, Jaká je jednotka SI této veličiny?); když ta není, vymění se až tři možnosti se stejnými pravidly, a když ani to nejde, otázka je nejednoznačná: trénink vezme jinou položku, kde je položka daná semínkem (denní módy, výzvy), zůstanou nejlepší údaje, které jdou.',
    '6. **Denní módy** mění možnosti jen se stabilními možnostmi denni-mody (Dnešní otázky, Kvíz dne a Tajemná otázka od 17. 11. 2026, Boss od týdne 23. 11. 2026), ať se dnešní sada nezmění; rozlišující údaj a prodloužený popis ukážou hned. Dobývání má pevné možnosti: chybí-li údaj, který je vyvrátí, dá místo otázky Mudrlanta místní otázku.'
].join('\n'));
lines.push('', '## Souhrn', '', ...header);
lines.push(row('**Celkem**', judged));
for (const [generator, list] of groupBy(judged, entry => entry.generator)) lines.push(row(generator, list));
for (const [kind, list] of groupBy(judged, entry => entry.kind)) lines.push(row(`druh: ${kind}`, list));
for (const [level, list] of [...groupBy(judged, entry => entry.level)].sort((a, b) => a[0] - b[0])) lines.push(row(`úroveň ${['', 'Základní (známé)', 'Mudrlant', 'Mudrlant Expert'][level]}`, list));
lines.push(row('s úvodem z Wikipedie', judged.filter(entry => entry.wiki)));
lines.push('', '## Podle témat', '', ...header);
for (const topicId of topics) lines.push(row(topicId, judged.filter(entry => entry.topic === topicId)));
lines.push('', '## Podle témat a druhů otázek', '', '| Téma | Druh otázky | Otázek | Před | Po |', '|---|---|---:|---:|---:|');
for (const [key, list] of [...groupBy(judged, entry => `${entry.topic} | ${entry.title}`)].sort()) lines.push(`| ${key} | ${list.length} | ${share(list, entry => !entry.before.ok)} | ${share(list, stillOpen)} |`);
const excluded = results.filter(entry => !judged.includes(entry));
lines.push('', `Nepočítané otázky (odpověď určí obrázek věci samé, mapa nebo místní otázka Dobývání): ${[...groupBy(excluded, entry => entry.kind)].map(([kind, list]) => `${kind} ${list.length}`).join(', ') || 'žádné'}.`);

const esc = (text) => String(text ?? '').replace(/\|/g, '\\|');
const describe = (entry) => {
    const b = entry.before;
    const a = entry.after;
    return [`### ${entry.name} (${entry.topic}, ${entry.generator}, ${entry.title})`, '',
        `- **Před:** ${b.text ? `„${esc(b.text)}“` : '(bez popisu)'}${b.facts.length ? ` · fakta: ${esc(b.facts.join('; '))}` : ''}`,
        `  - možnosti: ${esc(b.choices.join(', '))}`,
        `  - ${b.ok ? 'jednoznačná' : `nevyvrácené: ${esc(b.open.join(', '))}`}`,
        `- **Po:** ${a.text ? `„${esc(a.text)}“` : '(bez popisu)'}${a.clue.length ? ` · **rozlišující údaj: ${esc(a.clue.join('; '))}**` : ''}${a.facts.length ? ` · fakta: ${esc(a.facts.join('; '))}` : ''}`,
        `  - možnosti: ${esc(a.choices.join(', '))}${entry.swapped ? ' (vyměněné)' : ''}`,
        `  - ${a.ok ? `jednoznačná (${a.via})` : a.definition ? `určí ji jen popis z článku (data ho ověřit neumějí): ${esc(a.open.join(', '))}` : `stále nevyvrácené: ${esc(a.open.join(', '))}`}`, ''];
};
// Příklady: z každého tématu ty s úvodem z Wikipedie, které byly nejednoznačné a teď nejsou (různé generátory a druhy úprav)
const fixed = judged.filter(entry => !entry.before.ok && entry.after.ok && entry.kind !== 'jméno');
const picked = [];
for (const topicId of topics) {
    // Jeden příklad s rozlišujícím údajem u původních možností, jeden s vyměněnými možnostmi (oba s úvodem z Wikipedie, je-li)
    const own = fixed.filter(entry => entry.topic === topicId).sort((a, b) => Number(b.wiki) - Number(a.wiki));
    picked.push(...[own.find(entry => !entry.swapped && entry.after.clue.length), own.find(entry => entry.swapped)].filter(Boolean));
}
// Případ, kvůli kterému audit vznikl: Jan Werich mezi Karlem Högerem, Ladislavem Peškem a Jaroslavem Marvanem s obecným popisem
const werichCase = () => {
    const ctx = contextOf('film');
    const find = (name) => ctx.items.find(item => item.n === name);
    const werich = find('Jan Werich');
    const others = ['Karel Höger', 'Ladislav Pešek', 'Jaroslav Marvan'].map(find);
    if (!werich || others.some(other => !other)) return null;
    const question = { type: 'name', title: 'Kdo to je?', showName: false, accepted: [werich.n], answerLabel: werich.n, placeholder: '',
        choices: [werich, ...others].map(other => ({ id: other.q, label: other.n, correct: other === werich })) };
    const fetched = { ...core.processWikiText('Jan Werich byl český filmový a divadelní herec, komik, dramatik a filmový scénárista, písňový textař a spisovatel.'), fallback: false };
    const state = (after) => { const round = assemble({ item: werich, ctx, question, fetched, after, rng: core.createSeededRandom('werich') }); return { round, evaluation: evaluate(round, ctx) }; };
    const view = ({ round, evaluation }) => ({ choices: labelsOf(round.question), text: clip(round.texts.questionText), facts: (round.plan.leadFacts || []).map(fact => `${fact.label}: ${fact.value}`),
        clue: (round.plan.clue || []).map(fact => `${fact.label}: ${fact.value}`), ok: evaluation.ok, strict: evaluation.strict, open: evaluation.open, via: evaluation.via || evaluation.kind });
    return { generator: 'zadání', topic: 'film', name: werich.n, title: question.title, swapped: false, before: view(state(false)), after: view(state(true)) };
};
const werich = werichCase();
lines.push('', '## Příklady před a po', '');
if (werich) lines.push(...describe(werich));
for (const entry of picked) lines.push(...describe(entry));
const remaining = judged.filter(stillOpen);
const definitions = judged.filter(entry => entry.after.definition);
lines.push('', `## Zbývající nejednoznačné otázky (${remaining.length})`, '');
if (!remaining.length) lines.push('Žádné.');
else {
    lines.push('Hra je nepoloží tak, jak jsou: v tréninku vezme jinou položku (createRoundData: ambiguous), v denních módech, výzvách a Bossovi, kde je položka daná semínkem, zůstanou s nejlepšími údaji, které jdou; Dobývání místo nich dá místní otázku.', '');
    for (const entry of remaining.slice(0, 40)) lines.push(...describe(entry));
    if (remaining.length > 40) lines.push(`… a dalších ${remaining.length - 40} v JSON.`);
}
// Nejhorší výměny: náhrada mimo skupinu vyměněné možnosti, potom největší pokles podobnosti ke správné odpovědi
const allSwaps = judged.flatMap(entry => (entry.swaps || []).map(swap => ({ ...swap, entry })));
const worst = [...allSwaps].sort((a, b) => Number(a.similar) - Number(b.similar) || b.drop - a.drop).slice(0, 30);
lines.push('', `## Výměny nesprávných možností (${allSwaps.length} v ${count(judged, entry => entry.swapped)} otázkách)`, '');
lines.push(`Náhrada musí být stejného druhu, pohlaví, skupiny (třída, řád, čeleď, sport, mytologie, skupina prvků, stát, kontinent, jednotka, sloh, směr, jazyk) a okruhu jako vyměněná možnost a vyvrací ji ukázaný údaj; „Stejná skupina“ to ověřuje znovu (swapSimilar). Mimo skupinu: ${allSwaps.filter(swap => !swap.similar).length}, jiného druhu: ${allSwaps.filter(swap => !swap.sameType).length}, jiné kategorie: ${allSwaps.filter(swap => !swap.sameCategory).length}. Pokles = o kolik je náhrada správné odpovědi méně podobná než vyměněná možnost (skóre podobnosti tématu).`, '');
lines.push('| Téma | Otázka (správně) | Vyměněná možnost | Náhrada | Stejná skupina | Pokles podobnosti | Rozlišující údaj |', '|---|---|---|---|---|---:|---|');
for (const swap of worst) lines.push(`| ${swap.entry.topic} | ${esc(swap.entry.name)} | ${esc(swap.from)} | ${esc(swap.to)} | ${swap.similar ? 'ano' : '**ne**'} | ${swap.drop} | ${esc(swap.entry.after.clue.join('; ') || '(popis)')} |`);
lines.push('', `## Otázky, které určí jen popis (${definitions.length})`, '');
lines.push('Pojmy, procesy, zákony a jevy (Chemický prvek, Fotosyntéza, Ohmův zákon) nemají v datech údaje, které by šly porovnat, a u některých druhů, dinosaurů nebo částí těla údaje z dat podobné možnosti nerozliší: odpověď určí definice či konkrétní údaj z úvodu článku (místo nálezu, rok, orgán, ke kterému část patří), který ale data neobsahují. Audit to strukturovaně ověřit neumí, proto je počítá zvlášť a nepovažuje je za vyřešené ani za nejednoznačné. Hra takovou otázku položí jen s plným úvodem článku (aspoň 14 slov, u položky s údaji navíc s konkrétním údajem); bez Wikipedie (krátký popis z Wikidat) je otázka nejednoznačná a trénink vezme jinou položku.', '');
for (const [key, list] of [...groupBy(definitions, entry => `${entry.topic} – ${entry.title}`)].sort((a, b) => b[1].length - a[1].length)) lines.push(`- ${key}: ${list.length} (např. ${list.slice(0, 3).map(entry => entry.name).join(', ')})`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${lines.join('\n')}\n`);
fs.writeFileSync(jsonOut, `${JSON.stringify({
    generated: new Date().toISOString(), options: { topics, perLevel: PER_LEVEL, days: DAYS, challenges: CHALLENGES, conquest: CONQUEST, from: FIRST_DAY, wiki: wikiFile ? path.basename(wikiFile) : null },
    summary: { questions: results.length, judged: judged.length, before: count(judged, entry => !entry.before.ok), after: count(judged, entry => !entry.after.ok),
        byTopic: Object.fromEntries(topics.map(topicId => { const list = judged.filter(entry => entry.topic === topicId); return [topicId, { questions: list.length, before: count(list, entry => !entry.before.ok), after: count(list, entry => !entry.after.ok) }]; })) },
    swaps: allSwaps.map(({ entry, ...swap }) => ({ topic: entry.topic, name: entry.name, ...swap })), remaining, definitions: definitions.map(entry => ({ topic: entry.topic, name: entry.name, title: entry.title, generator: entry.generator })), examples: picked
}, null, 1)}\n`);
log(`Hotovo: ${judged.length} posouzených otázek, nejednoznačných před ${count(judged, entry => !entry.before.ok)}, po ${remaining.length}; zpráva ${path.relative(ROOT, out)}`);
process.exitCode = remaining.some(entry => !entry.ambiguous && entry.generator !== 'Dobývání') ? 1 : 0;
