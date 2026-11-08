// Číselné otázky: „Seřaď“ (čtyři položky podle čísla z dat) a „Odhadni číslo“ (body podle toho, jak blízko hráč byl).
// Čistá logika (výběr položek, body, čtení odhadu) a HTML obou obrazovek; aplikace (app.js) jen zavolá plan → buildRound,
// vloží HTML a předá odpověď. Čísla jsou jen ta spolehlivá z dat témat (f), každé téma má vlastní seznam vlastností (SPECS).
// Testy: tests/numeric-questions.test.js (logika na skutečných datech) a tests/e2e-numeric.test.js (v prohlížeči).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore, root);
    if (isNode) module.exports = api;
    else root.MudrlantNumeric = api;
})(typeof self !== 'undefined' ? self : this, (core, root) => {
    'use strict';

    const { escapeHtml, shuffle, pickRandom, plural, formatPoints, normalizeAnswer, getCountryNames, commonsPhotoUrl, isRealPhoto } = core;

    // Asi každá osmá otázka hry tématu, mixu a výzvy (jen kde téma má vhodná čísla). Testy: api.rate a api.force, nebo
    // window.MUDRLANT_NUMERIC_RATE nastavené před načtením skriptu (0 = testy, které počítají jen s obyčejnými otázkami)
    const RATE = 1 / 8;
    const START_RATE = root && typeof root.MUDRLANT_NUMERIC_RATE === 'number' ? root.MUDRLANT_NUMERIC_RATE : RATE;

    // --- Formát čísel ---

    const num = (value, digits = 0) => Number(value).toLocaleString('cs-CZ', { maximumFractionDigits: digits });
    // Zaokrouhlení na platné číslice (402 739 → 403 000, 78 871 → 78 900); čísla z dat nejsou přesnější
    const roundSig = (value, digits = 3) => {
        if (!value) return 0;
        const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - digits + 1);
        return Number((Math.round(value / step) * step).toPrecision(digits + 2));
    };
    // Letopočet jako jinde v aplikaci: 1805, 624 n. l., 490 př. n. l.
    const yearText = (value) => core.formatYear(value);
    const lightYears = (value) => {
        if (!Number.isInteger(value)) return `${num(value, 1)} světelného roku`;
        return plural(value, 'světelný rok', 'světelné roky', 'světelných let').replace(/^\d+/, num(value));
    };
    // unit: format = popisek hodnoty, round = hodnota k porovnání (a k zobrazení), suffix = jednotka u pole odhadu
    const UNITS = {
        m: { format: value => `${num(value)} m`, round: Math.round, suffix: 'm' },
        km: { format: value => `${num(value)} km`, round: value => value >= 1000 ? Math.round(value / 10) * 10 : Math.round(value), suffix: 'km' },
        km2: { format: value => `${num(value, value < 10 ? 2 : 0)} km²`, round: value => roundSig(value), suffix: 'km²' },
        people: { format: value => value >= 1e6 ? `${num(value / 1e6, 1)} mil. obyvatel` : `${num(value)} obyvatel`, round: value => roundSig(value), suffix: 'obyvatel' },
        seats: { format: value => `${num(value)} míst`, round: value => roundSig(value), suffix: 'míst' },
        year: { format: yearText, round: Math.round, prefix: 'rok' },
        plain: { format: value => num(value, 2), round: value => Math.round(value * 100) / 100 },
        mohs: { format: value => `tvrdost ${num(value, 2)}`, round: value => Math.round(value * 100) / 100 },
        // Geologický čas: miliony let (pod milion let v letech)
        ma: { format: value => value < 1 ? `${num(Math.round(value * 1e6))} let` : `${num(roundSig(value, 4), 2)} mil. let`, round: value => roundSig(value, 4) },
        days: { format: value => value < 1000 ? plural(Math.round(value), 'den', 'dny', 'dní') : plural(Math.round(value / 365.25), 'rok', 'roky', 'let'), round: value => roundSig(value) },
        ly: { format: lightYears, round: value => value < 10 ? Math.round(value * 10) / 10 : Math.round(roundSig(value)) }
    };

    // --- Vlastnosti témat ---

    // gap = jak daleko od sebe musí být hodnoty u „Seřaď“ (žádná skoro stejná čísla):
    // ratio = větší aspoň tolikrát větší, abs = rozdíl aspoň, year = rozdíl podle doby (u dávných dějin větší)
    const ratio = (min) => ({ mode: 'ratio', min });
    const abs = (min) => ({ mode: 'abs', min });
    const YEAR_GAP = { mode: 'year' };
    const yearGap = (value) => value >= 1900 ? 10 : value >= 1700 ? 15 : value >= 1400 ? 30 : value >= 1000 ? 60 : value >= 0 ? 120 : 200;
    const farEnough = (gap, a, b) => {
        if (gap.mode === 'ratio') return Math.max(a, b) >= Math.min(a, b) * gap.min;
        if (gap.mode === 'year') return Math.abs(a - b) >= yearGap(Math.min(a, b));
        return Math.abs(a - b) >= gap.min;
    };

    const has = (list) => (item) => list.includes(item.ty);
    const inGroup = (group) => (item) => (item.g || []).includes(group);
    const field = (key) => (item) => (item.f || {})[key];
    const firstOf = (value) => Array.isArray(value) ? value.slice(0, 2).join(', ') : value;
    // Krátký popisek pod názvem položky (stát, autor, město…), nikdy s hledaným číslem
    const detailOf = (...keys) => (item) => keys.map(key => firstOf((item.f || {})[key])).find(Boolean) || item.ty || '';
    const countriesOf = (item, ctx) => (ctx && ctx.countries ? getCountryNames(item, ctx.countries).slice(0, 2).join(', ') : '') || item.ty || '';

    // Osoby podle roku narození (stejné pro všechna témata s lidmi); odhad jen u známých narozených v našem letopočtu
    const born = (topic, category, label, detail = detailOf('land')) => ({
        id: `${topic}-${category}-narozeni`, topic, category, key: 'born', unit: 'year', gap: YEAR_GAP, detail,
        order: { asc: ['Seřaď od nejdříve narozeného', `${label} podle roku narození`] },
        estimate: { title: (item) => item.sx === 'f' ? 'V jakém roce se narodila?' : 'V jakém roce se narodil?', score: 'year', when: (item) => item.f.born >= 1000 }
    });
    // Díla, stavby, kluby… podle roku vzniku: jen od nejstaršího (přirozené pořadí času)
    const dated = (topic, category, key, title, detailText, detail, estimate = null, extra = {}) => ({
        id: `${topic}-${category}-${key}`, topic, category, key, unit: 'year', gap: YEAR_GAP, detail,
        order: { asc: [title, detailText] }, estimate: estimate && { score: 'year', ...estimate }, ...extra
    });

    // Tvrdost podle Mohse jako v datech: jedno číslo, nebo rozpětí (2,5–3)
    const mohsRange = (item) => {
        const [low, high] = Array.isArray(item.f.h) ? item.f.h : [item.f.hm, item.f.hm];
        return `tvrdost ${low === high ? num(low, 2) : `${num(low, 2)}–${num(high, 2)}`}`;
    };
    const MOUNTAINS = ['hora', 'sopka', 'stratovulkán'];
    // Stavby, u kterých je výška opravdu výška stavby (ne zbytek zdi, socha s podstavcem nebo naleziště)
    const LOW_OR_UNCLEAR = /socha|archeolog|posvátn|pomník|město|lokalita|zeď|val$/u;
    const TOWERS = ['mrakodrap', 'rozhledna', 'věž', 'vysílač', 'televizní věž', 'šikmá věž'];
    const MISSIONS = ['kosmická sonda', 'dalekohled', 'pilotovaný let', 'kosmická stanice', 'družice'];

    const SPECS = [
        // Zeměpis
        { id: 'zemepis-hora-vyska', topic: 'zemepis', category: 'hora', key: 'elev', unit: 'm', gap: ratio(1.12), filter: has(MOUNTAINS), detail: countriesOf,
            order: { desc: ['Seřaď od nejvyšší', 'Hory podle nadmořské výšky'], asc: ['Seřaď od nejnižší', 'Hory podle nadmořské výšky'] },
            estimate: { title: 'Kolik metrů měří tato hora?', score: 'ratio' } },
        { id: 'zemepis-reka-delka', topic: 'zemepis', category: 'reka', key: 'len', unit: 'km', gap: ratio(1.25), detail: countriesOf,
            order: { desc: ['Seřaď od nejdelší', 'Řeky podle délky'], asc: ['Seřaď od nejkratší', 'Řeky podle délky'] },
            estimate: { title: 'Kolik kilometrů měří tato řeka?', score: 'ratio' } },
        { id: 'zemepis-stat-rozloha', topic: 'zemepis', category: 'stat', key: 'area', unit: 'km2', gap: ratio(1.4), detail: detailOf('cap'),
            order: { desc: ['Seřaď od největšího', 'Státy podle rozlohy'], asc: ['Seřaď od nejmenšího', 'Státy podle rozlohy'] },
            estimate: { title: 'Jakou rozlohu má tento stát?', score: 'ratio' } },
        { id: 'zemepis-stat-obyvatele', topic: 'zemepis', category: 'stat', key: 'pop', unit: 'people', gap: ratio(1.4), detail: detailOf('cap'),
            order: { desc: ['Seřaď od nejlidnatějšího', 'Státy podle počtu obyvatel'], asc: ['Seřaď od nejméně lidnatého', 'Státy podle počtu obyvatel'] },
            // Miliony obyvatel se píšou snáz v milionech (10,9); celé číslo (10 900 000) platí také
            estimate: { title: 'Kolik obyvatel má tento stát?', score: 'ratio', inMillions: true } },
        // Počet obyvatel měst jen u českých obcí (u velkoměst světa záleží na tom, co se za město počítá)
        { id: 'zemepis-mesto-obyvatele', topic: 'zemepis', category: 'mesto', key: 'pop', unit: 'people', gap: ratio(1.3), filter: inGroup('cesko'), detail: () => '',
            order: { desc: ['Seřaď od největšího', 'Česká města podle počtu obyvatel'], asc: ['Seřaď od nejmenšího', 'Česká města podle počtu obyvatel'] },
            estimate: { title: 'Kolik obyvatel má toto město?', score: 'ratio' } },
        { id: 'zemepis-jezero-rozloha', topic: 'zemepis', category: 'jezero', key: 'area', unit: 'km2', gap: ratio(1.5), filter: has(['jezero']), detail: countriesOf,
            order: { desc: ['Seřaď od největšího', 'Jezera podle rozlohy'], asc: ['Seřaď od nejmenšího', 'Jezera podle rozlohy'] } },
        { id: 'zemepis-ostrov-rozloha', topic: 'zemepis', category: 'ostrov', key: 'area', unit: 'km2', gap: ratio(1.5), filter: has(['ostrov']), detail: countriesOf,
            order: { desc: ['Seřaď od největšího', 'Ostrovy podle rozlohy'], asc: ['Seřaď od nejmenšího', 'Ostrovy podle rozlohy'] } },
        { id: 'zemepis-stavba-vyska', topic: 'zemepis', category: 'stavba', key: 'h', unit: 'm', gap: ratio(1.2), detail: countriesOf,
            filter: (item) => item.f.h >= 40 && !LOW_OR_UNCLEAR.test(item.ty || ''),
            order: { desc: ['Seřaď od nejvyšší', 'Stavby podle výšky'], asc: ['Seřaď od nejnižší', 'Stavby podle výšky'] },
            estimate: { title: 'Kolik metrů měří tato stavba?', score: 'ratio', when: (item) => item.f.h >= 100 && TOWERS.includes(item.ty) } },
        // Historie
        dated('historie', 'bitva', 'year', 'Seřaď od nejstarší', 'Bitvy podle roku', (item) => item.f.place || item.f.war || '',
            { title: 'V jakém roce proběhla tato bitva?', when: (item) => item.f.year >= 1000 }, { id: 'historie-bitva-rok', filter: has(['bitva']) }),
        dated('historie', 'bitva', 'year', 'Seřaď od nejstarší', 'Války podle roku, kdy začaly', detailOf('place'),
            { title: 'V jakém roce začala tato válka?', when: (item) => item.f.year >= 1000 }, { id: 'historie-valka-rok', filter: has(['válka', 'občanská válka']) }),
        dated('historie', 'rise', 'from', 'Seřaď od nejstaršího', 'Státy minulosti podle roku vzniku', detailOf('cap')),
        born('historie', 'panovnik', 'Panovníci', detailOf('dyn', 'land')),
        born('historie', 'statnik', 'Státníci'),
        born('historie', 'osobnost', 'Osobnosti'),
        // Chemie
        { id: 'chemie-prvky-z', topic: 'chemie', category: 'prvky', key: 'z', unit: 'plain', gap: abs(4), detail: detailOf('sym'),
            order: { asc: ['Seřaď od nejnižšího', 'Prvky podle protonového čísla'], desc: ['Seřaď od nejvyššího', 'Prvky podle protonového čísla'] },
            estimate: { title: 'Jaké protonové číslo má tento prvek?', score: 'abs' } },
        dated('chemie', 'prvky', 'year', 'Seřaď od nejdříve objeveného', 'Prvky podle roku objevu', detailOf('sym'), null, { filter: (item) => item.f.year >= 1650 }),
        born('chemie', 'chemici', 'Chemici'),
        // Fyzika
        { id: 'fyzika-telesa-prumer', topic: 'fyzika', category: 'vesmir', key: 'diam', unit: 'km', gap: ratio(1.2), filter: has(['planeta', 'trpasličí planeta']), detail: (item) => item.ty,
            order: { desc: ['Seřaď od největšího', 'Planety a trpasličí planety podle průměru'], asc: ['Seřaď od nejmenšího', 'Planety a trpasličí planety podle průměru'] } },
        { id: 'fyzika-telesa-obeh', topic: 'fyzika', category: 'vesmir', key: 'period', unit: 'days', gap: ratio(1.4), filter: (item) => has(['planeta', 'trpasličí planeta'])(item) && (!item.f.parent || item.f.parent === 'Slunce'), detail: (item) => item.ty,
            order: { asc: ['Seřaď podle doby oběhu', 'Od nejkratší po nejdelší, kolem Slunce'], desc: ['Seřaď podle doby oběhu', 'Od nejdelší po nejkratší, kolem Slunce'] } },
        { id: 'fyzika-hvezdy-vzdalenost', topic: 'fyzika', category: 'vesmir', key: 'ly', unit: 'ly', gap: ratio(1.5), filter: (item) => item.ty === 'hvězda' && item.f.ly >= 0.001, detail: detailOf('const'),
            order: { asc: ['Seřaď od nejbližší', 'Hvězdy podle vzdálenosti od Země'], desc: ['Seřaď od nejvzdálenější', 'Hvězdy podle vzdálenosti od Země'] } },
        dated('fyzika', 'mise', 'year', 'Seřaď od nejstaršího', 'Lety, sondy a dalekohledy podle roku startu', (item) => item.ty, null, { filter: has(MISSIONS) }),
        born('fyzika', 'fyzici', 'Fyzici'),
        born('fyzika', 'astronomove', 'Astronomové a kosmonauti'),
        // Architektura
        dated('architektura', 'stavby', 'y', 'Seřaď od nejstarší', 'Stavby podle roku vzniku', detailOf('city')),
        born('architektura', 'architekti', 'Architekti'),
        // Film
        dated('film', 'filmy', 'year', 'Seřaď od nejstaršího', 'Filmy podle roku premiéry', detailOf('dir'), { title: 'V jakém roce měl tento film premiéru?' }),
        born('film', 'reziseri', 'Režiséři'),
        born('film', 'herci', 'Herci a herečky'),
        // Hudba
        dated('hudba', 'dila', 'year', 'Seřaď od nejstaršího', 'Díla podle roku vzniku', detailOf('by'), { title: 'V jakém roce toto dílo vzniklo?', when: (item) => item.f.year >= 1000 }),
        dated('hudba', 'kapely', 'from', 'Seřaď od nejstarší', 'Kapely podle roku vzniku', detailOf('city', 'genre'), { title: 'V jakém roce tato kapela vznikla?' }),
        born('hudba', 'skladatele', 'Skladatelé'),
        born('hudba', 'hudebnici', 'Hudebníci a zpěváci'),
        // Literatura
        dated('literatura', 'dila', 'year', 'Seřaď od nejstaršího', 'Díla podle roku vzniku', detailOf('by'), { title: 'V jakém roce toto dílo vzniklo?', when: (item) => item.f.year >= 1000 }),
        born('literatura', 'spisovatele', 'Spisovatelé a básníci'),
        // Sport
        dated('sport', 'kluby', 'from', 'Seřaď od nejstaršího', 'Kluby podle roku založení', detailOf('city', 'sport'), { title: 'V jakém roce byl tento klub založen?' }),
        { id: 'sport-sportoviste-kapacita', topic: 'sport', category: 'sportoviste', key: 'capacity', unit: 'seats', gap: ratio(1.3), filter: has(['stadion', 'aréna']), detail: detailOf('city', 'loc'),
            order: { desc: ['Seřaď od největšího', 'Stadiony a haly podle počtu míst'], asc: ['Seřaď od nejmenšího', 'Stadiony a haly podle počtu míst'] } },
        born('sport', 'sportovci', 'Sportovci', detailOf('sport', 'land')),
        // Výtvarné umění
        dated('umeni', 'obrazy', 'year', 'Seřaď od nejstaršího', 'Obrazy podle roku vzniku', detailOf('by'), { title: 'V jakém roce tento obraz vznikl?', when: (item) => item.f.year >= 1000 }),
        dated('umeni', 'sochy', 'year', 'Seřaď od nejstarší', 'Sochy podle roku vzniku', detailOf('by')),
        born('umeni', 'umelci', 'Malíři a sochaři'),
        born('umeni', 'fotografove', 'Fotografové'),
        born('umeni', 'ilustratori', 'Ilustrátoři a karikaturisté'),
        // Geologie: tvrdost podle Mohse a stáří období (stejná úroveň: éry, periody, nebo epochy)
        { id: 'geologie-nerosty-tvrdost', topic: 'geologie', category: 'nerosty', key: 'hm', unit: 'mohs', gap: abs(1), detail: detailOf('formula'), label: mohsRange,
            order: { desc: ['Seřaď od nejtvrdšího', 'Nerosty podle tvrdosti (Mohsova stupnice)'], asc: ['Seřaď od nejměkčího', 'Nerosty podle tvrdosti (Mohsova stupnice)'] } },
        { id: 'geologie-kameny-tvrdost', topic: 'geologie', category: 'kameny', key: 'hm', unit: 'mohs', gap: abs(1), detail: detailOf('formula'), label: mohsRange,
            order: { desc: ['Seřaď od nejtvrdšího', 'Drahé kameny podle tvrdosti (Mohsova stupnice)'], asc: ['Seřaď od nejměkčího', 'Drahé kameny podle tvrdosti (Mohsova stupnice)'] } },
        { id: 'geologie-obdobi-stari', topic: 'geologie', category: 'obdobi', key: 'from', unit: 'ma', gap: ratio(1.08), filter: (item) => ['éra', 'perioda', 'epocha'].includes(item.f.lvl),
            group: (item) => item.f.lvl, detail: (item) => item.f.lvl,
            order: { desc: ['Seřaď od nejstaršího', { 'éra': 'Éry podle stáří', perioda: 'Periody podle stáří', epocha: 'Epochy podle stáří' }] } },
        // Vlajky a znaky: státy podle rozlohy, česká města podle počtu obyvatel
        { id: 'vlajky-vlajka-rozloha', topic: 'vlajky', category: 'vlajka', key: 'area', unit: 'km2', gap: ratio(1.4), detail: detailOf('cap'),
            order: { desc: ['Seřaď od největšího', 'Státy podle rozlohy'], asc: ['Seřaď od nejmenšího', 'Státy podle rozlohy'] } },
        { id: 'vlajky-cesko-obyvatele', topic: 'vlajky', category: 'cesko', key: 'pop', unit: 'people', gap: ratio(1.3), filter: has(['město']), detail: detailOf('kraj'),
            order: { desc: ['Seřaď od největšího', 'Česká města podle počtu obyvatel'], asc: ['Seřaď od nejmenšího', 'Česká města podle počtu obyvatel'] } }
    ];
    const SPEC_BY_ID = new Map(SPECS.map(spec => [spec.id, spec]));
    const specsFor = (topicId) => SPECS.filter(spec => spec.topic === topicId);

    // Hodnota položky pro vlastnost; jen konečné číslo (u veličin kladné)
    const valueOf = (spec, item) => {
        const value = field(spec.key)(item);
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        if (spec.unit !== 'year' && value <= 0) return null;
        return UNITS[spec.unit].round(value);
    };
    // Název s letopočtem (Letní olympijské hry 1896, 2001: Vesmírná odysea) by pořadí či odhad roku prozradil nebo zmátl
    const nameHasNumber = (spec, item) => spec.unit === 'year' ? /\d{3,4}/.test(item.n) : /\d/.test(item.n) && spec.unit === 'people';
    const isEligible = (spec, item) => Boolean(item && item.c === spec.category && !item.nq && item.f && valueOf(spec, item) !== null
        && !nameHasNumber(spec, item) && (!spec.filter || spec.filter(item)));
    const canEstimate = (spec, item) => Boolean(spec.estimate) && item.k === 1 && (!spec.estimate.when || spec.estimate.when(item));
    const groupOf = (spec, item) => spec.group ? spec.group(item) : '';

    // Čtyři položky se stejnou skupinou jako výchozí, každé dvě hodnoty dost daleko od sebe a různé názvy
    const pickOrderItems = (spec, anchor, eligible, rng) => {
        const group = groupOf(spec, anchor);
        const chosen = [anchor];
        const names = new Set([normalizeAnswer(anchor.n)]);
        for (const candidate of shuffle(eligible, rng)) {
            if (chosen.length === 4) break;
            if (candidate.q === anchor.q || groupOf(spec, candidate) !== group || names.has(normalizeAnswer(candidate.n))) continue;
            const value = valueOf(spec, candidate);
            if (!chosen.every(other => farEnough(spec.gap, valueOf(spec, other), value))) continue;
            chosen.push(candidate);
            names.add(normalizeAnswer(candidate.n));
        }
        return chosen.length === 4 ? chosen : null;
    };

    // Plán otázky: druh, vlastnost, položky v pořadí, jak se ukážou, a směr. null = obyčejná otázka.
    // Volání rng jsou v pevném pořadí: výzva (stejné semínko) tak dá všem hráčům stejnou otázku.
    // pool = položky, ze kterých hra právě vybírá (kategorie a známost podle nastavení či výzvy), item = vylosovaná položka
    const plan = ({ topic, item, pool, rng, rate = api.rate, force = api.force }) => {
        if (!topic || !Array.isArray(pool) || !pool.length || typeof rng !== 'function') return null;
        if (!(rng() < (force ? 1 : rate))) return null;
        const options = [];
        for (const spec of specsFor(topic.id)) {
            const eligible = pool.filter(other => isEligible(spec, other));
            if (spec.order && eligible.length >= 4) options.push({ kind: 'order', spec, eligible });
            const known = spec.estimate ? eligible.filter(other => canEstimate(spec, other)) : [];
            if (known.length) options.push({ kind: 'estimate', spec, eligible: known });
        }
        // Přednost má vlastnost vylosované položky (hora → hory), jinak kterákoli z tématu
        const own = options.filter(option => item && option.eligible.includes(item));
        let list = own.length ? own : options;
        // force (jen testy): právě tento druh, i když vylosovaná položka žádný nemá; když téma tento druh nemá, obyčejná otázka
        if (force) list = (list.some(option => option.kind === force) ? list : options).filter(option => option.kind === force);
        if (!list.length) return null;
        const kinds = ['order', 'estimate'].filter(kind => list.some(option => option.kind === kind));
        const kind = kinds.length > 1 ? (rng() < 0.5 ? 'order' : 'estimate') : kinds[0];
        const option = pickRandom(list.filter(candidate => candidate.kind === kind), rng);
        const { spec, eligible } = option;
        if (kind === 'estimate') {
            const anchor = item && eligible.includes(item) ? item : pickRandom(eligible, rng);
            return { kind, spec: spec.id, ids: [anchor.q] };
        }
        const dirs = ['desc', 'asc'].filter(dir => spec.order[dir]);
        const dir = dirs.length > 1 ? (rng() < 0.5 ? dirs[0] : dirs[1]) : dirs[0];
        const anchors = [item && eligible.includes(item) ? item : null, ...shuffle(eligible, rng).slice(0, 6)].filter(Boolean);
        for (const anchor of anchors) {
            const chosen = pickOrderItems(spec, anchor, eligible, rng);
            if (!chosen) continue;
            // Položky se ukážou v náhodném pořadí, nikdy rovnou seřazené (ani obráceně)
            let shown = shuffle(chosen, rng);
            const sorted = [...chosen].sort((a, b) => valueOf(spec, a) - valueOf(spec, b)).map(other => other.q).join();
            const sortedBack = [...chosen].sort((a, b) => valueOf(spec, b) - valueOf(spec, a)).map(other => other.q).join();
            if ([sorted, sortedBack].includes(shown.map(other => other.q).join())) shown = [shown[1], shown[0], shown[3], shown[2]];
            return { kind, spec: spec.id, dir, ids: shown.map(other => other.q) };
        }
        return null;
    };

    const photoOf = (item, ctx) => isRealPhoto(item.im) && item.ih && !(ctx.textPhotos && ctx.textPhotos.has(item.im)) ? commonsPhotoUrl(item.im, item.ih, 120) : null;
    const textOf = (value) => typeof value === 'function' ? '' : String(value || '');
    const pick = (value, key) => value && typeof value === 'object' ? value[key] || '' : value;

    // Data otázky (uloží se celá s relací, výsledek je vykreslí bez dat tématu)
    const buildRound = (planned, ctx) => {
        const spec = planned && SPEC_BY_ID.get(planned.spec);
        if (!spec || !ctx || !ctx.byId) return null;
        const items = planned.ids.map(id => ctx.byId.get(id));
        if (!items.length || items.some(item => !isEligible(spec, item))) return null;
        const unit = UNITS[spec.unit];
        const category = (ctx.topic.categories || []).find(entry => entry.key === spec.category) || {};
        // Popisek pod názvem jen tehdy, když něco přidá (ne „Amiens“ u Katedrály Notre-Dame (Amiens))
        const detailFor = (item) => {
            const text = textOf(spec.detail ? spec.detail(item, ctx) : item.ty);
            return text && !normalizeAnswer(item.n).includes(normalizeAnswer(text)) ? text : '';
        };
        const entry = (item) => ({
            id: item.q, name: item.n, title: item.t || item.n, value: valueOf(spec, item), label: spec.label ? spec.label(item) : unit.format(valueOf(spec, item)),
            detail: detailFor(item), photo: photoOf(item, ctx), known: item.k === 1
        });
        const anchor = items[0];
        const base = {
            topic: ctx.topic.id, id: anchor.q, title: anchor.t || anchor.n, category: spec.category, known: items.every(item => item.k === 1),
            questionText: '', photoUrl: null, questionImage: null, photoMasks: null, visual: null, resultVisual: null, resultFacts: [], hints: [], leadFacts: [],
            subtitle: '', coords: null, isCzech: false, description: '', thin: false, funFacts: []
        };
        if (planned.kind === 'order') {
            if (items.length !== 4) return null;
            // Obrázky buď u všech čtyř položek, nebo u žádné: jediný obrázek by jednu možnost zbytečně zvýraznil
            const all = items.map(entry);
            const rows = all.every(row => row.photo) ? all : all.map(row => ({ ...row, photo: null }));
            const [title, detailText] = spec.order[planned.dir] || [];
            const correct = rows.map((row, index) => index).sort((a, b) => planned.dir === 'desc' ? rows[b].value - rows[a].value : rows[a].value - rows[b].value);
            return {
                ...base, name: title, typeLabel: 'Seřaď',
                question: { type: 'order', title, answerLabel: correct.map(index => `${rows[index].name} (${rows[index].label})`).join(', ') },
                numeric: { kind: 'order', spec: spec.id, dir: planned.dir, title, detail: pick(detailText, groupOf(spec, anchor)), categoryLabel: category.label || '', categoryIcon: category.icon || 'hash', items: rows, order: correct }
            };
        }
        const row = entry(anchor);
        const kindLabel = anchor.ty || category.one || '';
        // Druh položky je už nad názvem: popisek pod ním by ho jen opakoval (vojevůdce · vojevůdce)
        if (normalizeAnswer(row.detail) === normalizeAnswer(kindLabel)) row.detail = '';
        const title = typeof spec.estimate.title === 'function' ? spec.estimate.title(anchor) : spec.estimate.title;
        return {
            ...base, name: anchor.n, typeLabel: 'Odhadni číslo',
            question: { type: 'estimate', title, answerLabel: row.label },
            numeric: {
                kind: 'estimate', spec: spec.id, title, mode: spec.estimate.score, value: row.value, label: row.label, item: row,
                categoryLabel: kindLabel, categoryIcon: category.icon || 'gauge',
                suffix: spec.estimate.inMillions ? 'mil.' : unit.suffix || '', prefix: unit.prefix || '', inMillions: Boolean(spec.estimate.inMillions),
                inputmode: spec.estimate.inMillions ? 'decimal' : 'numeric'
            }
        };
    };
    const isKind = (data) => Boolean(data && data.numeric && (data.numeric.kind === 'order' || data.numeric.kind === 'estimate'));

    // --- Body ---

    // Body bez nápověd: plné 4 (ve variantě psaní dvojnásobek jako u ostatních otázek), částečné podle přesnosti; 0 = špatně
    const MAX_BASE = 4;
    const pointsFor = (base, variant) => Math.max(0, Math.min(MAX_BASE, base | 0)) * (variant === 'typed' ? 2 : 1);

    // Seřaď: všechno správně 4 body, jen jedna prohozená sousední dvojice 2 body, jinak nic
    // (náhodné klepání dá v průměru méně než půl bodu, stejně jako u výběru ze čtyř možností jde o štěstí málo)
    const scoreOrder = (data, order) => {
        const correct = data.numeric.order;
        const valid = Array.isArray(order) && order.length === correct.length && new Set(order).size === correct.length && order.every(index => correct.includes(index));
        if (!valid) return { base: 0, inversions: null, positions: correct.map(() => false), placed: 0 };
        const rank = new Map(correct.map((index, position) => [index, position]));
        const sequence = order.map(index => rank.get(index));
        let inversions = 0;
        for (let i = 0; i < sequence.length; i++) for (let j = i + 1; j < sequence.length; j++) if (sequence[i] > sequence[j]) inversions++;
        const positions = correct.map((index, position) => order[position] === index);
        return { base: inversions === 0 ? MAX_BASE : inversions === 1 ? 2 : 0, inversions, positions, placed: positions.filter(Boolean).length };
    };

    // Odhad: u velikostí poměr (o kolik procent vedle, stejně přísně nahoru i dolů), u letopočtů roky, u protonového čísla rozdíl.
    // Letopočet: čím dávnější, tím větší tolerance (u 20. století rok, u středověku pět let)
    const yearUnit = (value) => value >= 1900 ? 1 : value >= 1500 ? 2 : value >= 1000 ? 5 : 10;
    const ladderFor = (mode, value) => {
        if (mode === 'ratio') return [[0.05, 4], [0.1, 3], [0.25, 2], [0.5, 1]];
        if (mode === 'year') { const u = yearUnit(value); return [[u, 4], [3 * u, 3], [8 * u, 2], [15 * u, 1]]; }
        return [[0, 4], [2, 3], [5, 2], [10, 1]];
    };
    const errorOf = (mode, guess, truth) => mode === 'ratio'
        ? (guess > 0 && truth > 0 ? Math.max(guess, truth) / Math.min(guess, truth) - 1 : Infinity)
        : Math.abs(guess - truth);
    const scoreEstimate = (data, guess) => {
        const { mode, value } = data.numeric;
        if (typeof guess !== 'number' || !Number.isFinite(guess)) return { base: 0, error: Infinity };
        const error = errorOf(mode, guess, value);
        const step = ladderFor(mode, value).find(([limit]) => error <= limit + 1e-9);
        return { base: step ? step[1] : 0, error };
    };
    // Jak daleko byl odhad slovy: „o 6 % méně“, „2,5× víc“, „o 3 roky později“, „přesně“
    const missText = (data, guess) => {
        const { mode, value } = data.numeric;
        if (!Number.isFinite(guess)) return '';
        if (mode === 'ratio') {
            const share = guess / value;
            if (Math.abs(share - 1) < 0.005) return 'přesně';
            if (share >= 2) return `${num(share, 1)}× víc`;
            if (share <= 0.5) return share > 0 ? `${num(1 / share, 1)}× méně` : 'vedle';
            return `o ${num(Math.max(1, Math.round(Math.abs(share - 1) * 100)))} % ${share > 1 ? 'víc' : 'méně'}`;
        }
        const diff = Math.round(Math.abs(guess - value));
        if (!diff) return 'přesně';
        if (mode === 'year') return `o ${plural(diff, 'rok', 'roky', 'let')} ${guess > value ? 'později' : 'dříve'}`;
        return `o ${num(diff)} ${guess > value ? 'víc' : 'méně'}`;
    };
    // Pravidla bodování pro výsledek („4 body do 5 %, 3 do 10 %…“), body podle varianty hry
    const ladderText = (data, variant) => {
        const { mode, value } = data.numeric;
        const steps = ladderFor(mode, value);
        const limit = (amount) => mode === 'ratio' ? `${Math.round(amount * 100)} %` : mode === 'year' ? plural(amount, 'roku', 'let', 'let') : num(amount);
        return steps.map(([amount, base], index) => {
            const points = pointsFor(base, variant);
            const what = amount === 0 ? 'přesně' : `do ${limit(amount)}`;
            return index === 0 ? `${formatPoints(points)} ${what}` : `${points} ${what}`;
        }).join(', ');
    };

    // --- Čtení odhadu ---

    // Číslo z textu hráče: mezery a tečky jako oddělovač tisíců (1 603, 1.603), čárka i tečka jako desetinná (10,9),
    // slova tis./mil./mld. (1,5 mil.), před naším letopočtem (490 př. n. l., −490). Ostatní text (m, km, obyvatel) se ignoruje.
    const SCALES = [[/^(?:mld|miliard)/u, 1e9], [/^(?:mil|mio)/u, 1e6], [/^(?:tis|k$)/u, 1e3]];
    const parseNumber = (text) => {
        let source = String(text ?? '').normalize('NFKC').toLocaleLowerCase('cs').trim();
        if (!source || source.length > 40) return NaN;
        let negative = false;
        const era = /př\.?\s*n\.?\s*l\.?|před\s+naším|pnl|\bbc\b/u;
        if (era.test(source)) { negative = true; source = source.replace(era, ' '); }
        const match = source.match(/([−–-]\s*)?(\d[\d\s.,'’]*)/u);
        if (!match) return NaN;
        if (match[1]) negative = true;
        let digits = match[2].replace(/[\s'’]+$/u, '').replace(/[.,]+$/u, '');
        const rest = source.slice(match.index + match[0].length).trim();
        digits = digits.replace(/[\s'’]/gu, '');
        const dots = (digits.match(/\./g) || []).length;
        const commas = (digits.match(/,/g) || []).length;
        if (dots && commas) {
            // Poslední z nich je desetinný oddělovač (1.234,5 i 1,234.5)
            const decimal = digits.lastIndexOf('.') > digits.lastIndexOf(',') ? '.' : ',';
            digits = digits.split(decimal === '.' ? ',' : '.').join('').replace(decimal, '.');
        } else if (dots + commas > 1) {
            digits = digits.replace(/[.,]/g, '');
        } else if (dots + commas === 1) {
            // Jeden oddělovač: před přesně třemi číslicemi tisíce (1.603, 402,739), jinak desetinná část (10,9)
            digits = /^\d{1,3}[.,]\d{3}$/.test(digits) ? digits.replace(/[.,]/, '') : digits.replace(',', '.');
        }
        let value = Number(digits);
        if (!Number.isFinite(value)) return NaN;
        const scale = SCALES.find(([pattern]) => pattern.test(rest));
        if (scale) value *= scale[1];
        if (negative) value = -value;
        return Math.abs(value) > 1e13 ? NaN : value;
    };
    // Odhad k porovnání: u počtu obyvatel států v milionech (10,9 = 10 900 000), celé číslo nad 10 000 platí, jak je
    const readGuess = (data, text) => {
        const value = parseNumber(text);
        if (!Number.isFinite(value)) return NaN;
        const scaled = /mil|mld|tis|k$/iu.test(String(text)) || Math.abs(value) >= 10000;
        return data.numeric.inMillions && !scaled ? value * 1e6 : value;
    };
    const formatGuess = (data, guess) => {
        const spec = SPEC_BY_ID.get(data.numeric.spec);
        const unit = UNITS[spec ? spec.unit : 'plain'];
        return unit.format(spec && spec.unit === 'year' ? Math.round(guess) : guess);
    };

    // Stupnice ve výsledku odhadu (visuals.js, typ scale): správná hodnota (popisek nad osou) a odhad jako značka (popisek pod ní).
    // Velikost od nuly (délka pruhu odpovídá číslu), odhad o řád vedle v logaritmickém měřítku, letopočty a pořadová čísla kolem obou hodnot
    const scaleSpec = (data, guess) => {
        const { value, mode, label } = data.numeric;
        const has = Number.isFinite(guess);
        const low = has ? Math.min(value, guess) : value;
        const high = has ? Math.max(value, guess) : value;
        let range;
        let log = false;
        if (mode === 'year') { const pad = Math.max(5, (high - low) * 0.3); range = [low - pad, high + pad]; }
        else if (mode === 'abs') { const pad = Math.max(3, (high - low) * 0.3); range = [Math.max(0, low - pad), high + pad]; }
        else if (has && low > 0 && high / low > 8) { log = true; range = [low / 2, high * 2]; }
        else range = [0, high * 1.3];
        return {
            type: 'scale', name: 'odhad', icon: 'gauge', min: range[0], max: range[1], log, value, valueLabel: label,
            minLabel: mode === 'ratio' && !log ? '0' : '', ticks: [],
            marks: has ? [{ value: guess, label: `tvůj odhad ${formatGuess(data, guess)}` }] : [],
            describe: has ? `Stupnice: správně ${label}, tvůj odhad ${formatGuess(data, guess)}.` : `Stupnice se správnou hodnotou ${label}.`
        };
    };

    // --- Vzhled (HTML) ---
    // ui = pomůcky aplikace: style (barvy tématu), card, cardTitle, art(name, cls), xpLine(xp, tone), statsCard, reportIcon, reportText,
    // nextLabel, wikiUrl(title), timer (zápas turnaje), variant, score (čip s body ve hře v záhlaví otázky), labelRoom (šířka štítku vedle čipů),
    // (výsledek číselné otázky součet bodů neukazuje: pořadí musí zůstat nad tlačítkem Další i na 360×640)

    const BADGE_OFF = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-base font-black text-slate-400 dark:border-slate-500 dark:text-slate-500';
    const BADGE_ON = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-transparent text-base font-black text-white shadow-sm';
    const ROW_OFF = 'flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors active:scale-[0.99] dark:border-slate-600 dark:bg-slate-700';
    const ROW_ON = 'flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl border-2 px-2.5 py-1.5 text-left transition-colors active:scale-[0.99]';
    // Celý obrázek (znak, vlajka, fotka) bez ořezu
    const thumb = (photo, size = 'h-10 w-10') => photo
        ? `<span data-numeric-photo="${escapeHtml(photo)}" class="${size} shrink-0 rounded-xl bg-slate-200 bg-contain bg-center bg-no-repeat dark:bg-slate-600" aria-hidden="true"></span>`
        : '';
    const solidOf = (style) => String(style.solid || '').split(/\s+/).filter(cls => cls.startsWith('bg-')).join(' ');
    const orderLabel = (row, position) => position >= 0 ? `${row.name}: ${position + 1}. místo, klepnutím ho zrušíš` : `${row.name}: klepnutím dáš další místo`;
    const pickedOf = (round) => (Array.isArray(round.pick) ? round.pick : []);

    const KIND_ICONS = { order: 'hash', estimate: 'gauge' };
    const headerHtml = (data, ui, subtitle = '') => `
        <div class="relative flex flex-col items-center gap-1 text-center">
            ${ui.score || ''}
            ${ui.timer ? '<span class="absolute right-0 top-0 inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2 py-0.5 text-xs font-black tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-100" title="Čas na tuto otázku: při shodě rozhoduje rychlejší hráč"><i data-lucide="timer" class="h-3.5 w-3.5"></i><span data-tour-timer>0:00</span></span>' : ''}
            <span class="inline-flex ${(ui.score || ui.timer) && ui.labelRoom ? ui.labelRoom : 'max-w-full'} items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm ${ui.style.solid}">
                <i data-lucide="${KIND_ICONS[data.numeric.kind]}" class="h-3 w-3 shrink-0"></i> <span class="truncate">${escapeHtml(data.typeLabel)}</span>
            </span>
            <h2 class="text-[22px] font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(data.question.title)}</h2>
            ${subtitle ? `<p class="text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">${escapeHtml(subtitle)}</p>` : ''}
        </div>`;
    const giveUpHtml = (ui) => `
        <div class="flex items-center justify-center gap-1">
            <button type="button" data-action="give-up" class="flex min-h-[2.75rem] items-center gap-2 px-3 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400">
                <i data-lucide="eye" class="h-4 w-4"></i> Nevím, ukázat odpověď
            </button>
            ${ui.reportIcon || ''}
        </div>`;
    const orderRowHtml = (row, index, position, ui) => `
        <li>
            <button type="button" data-action="order-pick" data-index="${index}" aria-pressed="${position >= 0}" aria-label="${escapeHtml(orderLabel(row, position))}" class="${position >= 0 ? `${ROW_ON} ${ui.style.on}` : ROW_OFF}">
                <span data-order-badge class="${position >= 0 ? `${BADGE_ON} ${solidOf(ui.style)}` : BADGE_OFF}" aria-hidden="true">${position >= 0 ? position + 1 : ''}</span>
                ${thumb(row.photo)}
                <span class="min-w-0 flex-1">
                    <span class="line-clamp-2 break-words text-[15px] font-bold leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(row.name)}</span>
                    ${row.detail ? `<span class="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(row.detail)}</span>` : ''}
                </span>
            </button>
        </li>`;
    const orderStatus = (count) => count >= 4 ? 'Hotovo, potvrď pořadí' : count ? `Vybráno ${count} ze 4` : 'Klepej postupně od prvního';

    // Rada pod polem odhadu
    const noteText = (data) => data.numeric.inMillions ? 'V milionech obyvatel, třeba 10,5. Stačí přibližně.' : data.numeric.prefix ? 'Stačí přibližně, body jsou i za blízký rok.' : 'Stačí přibližně, mezery ani tečky nevadí.';

    const questionHtml = (data, round, ui) => {
        const n = data.numeric;
        const maxPoints = formatPoints(pointsFor(MAX_BASE, ui.variant));
        if (n.kind === 'order') {
            const picked = pickedOf(round);
            return `
            <div class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 dark:bg-slate-900" data-numeric-question="order">
                ${headerHtml(data, ui, n.detail)}
                <section class="${ui.card} p-3">
                    <div class="mb-2 flex items-center justify-between gap-2">
                        <h3 class="${ui.cardTitle} shrink-0"><i data-lucide="target" class="h-4 w-4 ${ui.style.text}"></i> Za ${maxPoints}</h3>
                        <span data-order-status class="text-right text-[11px] font-bold text-slate-500 dark:text-slate-400" aria-live="polite">${orderStatus(picked.length)}</span>
                    </div>
                    <ol class="flex flex-col gap-2" aria-label="Položky k seřazení">
                        ${n.items.map((row, index) => orderRowHtml(row, index, picked.indexOf(index), ui)).join('')}
                    </ol>
                    <button type="button" data-action="order-confirm" ${picked.length === 4 ? '' : 'disabled'} class="btn-3d mt-3 flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-black text-white disabled:opacity-50 ${ui.style.button}">
                        <i data-lucide="check" class="h-5 w-5"></i> Potvrdit pořadí
                    </button>
                </section>
                ${giveUpHtml(ui)}
            </div>`;
        }
        const row = n.item;
        return `
            <div class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 dark:bg-slate-900" data-numeric-question="estimate">
                ${headerHtml(data, ui)}
                <section class="${ui.card} flex items-center gap-3 p-3">
                    ${thumb(row.photo, 'h-16 w-16')}
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">${escapeHtml(n.categoryLabel)}</p>
                        <p class="text-xl font-black leading-tight text-slate-800 dark:text-slate-50">${escapeHtml(row.name)}</p>
                        ${row.detail ? `<p class="truncate text-sm font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(row.detail)}</p>` : ''}
                    </div>
                </section>
                <section class="${ui.card} p-3">
                    <h3 class="${ui.cardTitle} mb-2"><i data-lucide="target" class="h-4 w-4 ${ui.style.text}"></i> Až ${maxPoints} podle přesnosti</h3>
                    <form id="estimate-form" class="flex gap-2" autocomplete="off" novalidate>
                        <label for="estimate-input" class="sr-only">Tvůj odhad${n.suffix ? ` (${escapeHtml(n.suffix)})` : ''}</label>
                        <div class="relative min-w-0 flex-1">
                            ${n.prefix ? `<span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-slate-500 dark:text-slate-400" aria-hidden="true">${escapeHtml(n.prefix)}</span>` : ''}
                            <input id="estimate-input" name="guess" type="text" inputmode="${n.inputmode}" enterkeyhint="done" maxlength="24" autocomplete="off" placeholder="${n.prefix ? 'třeba 1850' : 'Napiš číslo'}" aria-describedby="estimate-note" class="w-full rounded-xl border border-slate-200 bg-white py-3 ${n.prefix ? 'pl-11' : 'pl-4'} ${n.suffix.length > 8 ? 'pr-28' : n.suffix.length > 3 ? 'pr-20' : n.suffix ? 'pr-12' : 'pr-4'} text-lg font-bold tabular-nums text-slate-800 placeholder:text-base placeholder:font-medium placeholder:text-slate-500 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400">
                            ${n.suffix ? `<span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-slate-500 dark:text-slate-400" aria-hidden="true">${escapeHtml(n.suffix)}</span>` : ''}
                        </div>
                        <button type="submit" class="btn-3d flex min-h-[3rem] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-base font-black text-white ${ui.style.button}">
                            <i data-lucide="check" class="h-5 w-5"></i> <span class="max-[379px]:sr-only">Potvrdit</span>
                        </button>
                    </form>
                    <p id="estimate-note" data-estimate-note class="mt-1.5 min-h-[1rem] text-xs font-semibold text-slate-500 dark:text-slate-400" aria-live="polite">${escapeHtml(noteText(data))}</p>
                </section>
                ${giveUpHtml(ui)}
            </div>`;
    };

    // Verdikt výsledku: sova, slova podle bodů a XP
    const verdictHtml = (round, ui, good, partial, bad, line) => {
        const ok = round.correct;
        const tone = ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300';
        return `
            <div data-verdict tabindex="-1" class="flex items-center gap-3 rounded-2xl border px-4 py-3 outline-none ${ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30' : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/30'}">
                ${ui.art(ok ? 'sova-radost' : 'sova-smutek', 'h-[4.5rem] w-[4.5rem] -my-3')}
                <div class="min-w-0">
                    <p class="font-black ${ok ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'}">${escapeHtml(round.gaveUp ? 'Tentokrát bez odpovědi' : ok ? (partial ? partial : good) : bad)}${ok ? ` +${escapeHtml(formatPoints(round.points))}` : ''}</p>
                    ${line ? `<p class="text-sm ${tone}">${escapeHtml(line)}</p>` : ''}
                    ${ui.xpLine(round.xp, tone)}
                </div>
            </div>`;
    };
    const footerHtml = (ui, extra = '') => `
                    ${ui.statsCard || ''}
                    <div class="flex gap-2">${extra}${ui.reportText || ''}</div>
                </div>
                <div class="sticky bottom-0 z-20 flex gap-2 border-t border-slate-200/70 bg-slate-50/95 px-4 pb-4 pt-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
                    <button type="button" data-action="next" class="btn-3d flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[1.2rem] py-3.5 text-lg font-bold text-white shadow-lg transition-all active:scale-95 max-[389px]:text-base ${ui.style.button}">
                        <span class="truncate">${escapeHtml(ui.nextLabel)}</span> <i data-lucide="arrow-right" class="h-5 w-5 shrink-0"></i>
                    </button>
                </div>
            </div>`;

    const resultHtml = (data, round, ui) => {
        const n = data.numeric;
        if (n.kind === 'order') {
            const score = round.score || scoreOrder(data, round.pick);
            const picked = pickedOf(round);
            const answered = !round.gaveUp && picked.length === 4;
            const line = !answered ? `Správné pořadí je níže` : score.base === MAX_BASE ? 'Celé pořadí sedí' : score.inversions === 1 ? 'Jen dvě sousední položky jsou prohozené' : `Na správném místě: ${score.placed} ze 4`;
            const rows = n.order.map((index, position) => {
                const row = n.items[index];
                const mine = picked.indexOf(index);
                const right = answered && mine === position;
                const mark = !answered ? '' : right
                    ? '<span class="inline-flex items-center gap-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300"><i data-lucide="check" class="h-3.5 w-3.5"></i> sedí</span>'
                    : `<span class="inline-flex items-center gap-0.5 text-[11px] font-black text-rose-700 dark:text-rose-300"><i data-lucide="x" class="h-3.5 w-3.5"></i> tvoje ${mine + 1}.</span>`;
                return `
                    <li>
                        <button type="button" data-action="item-info" data-topic="${escapeHtml(data.topic)}" data-id="${escapeHtml(row.id)}" aria-label="${escapeHtml(`${position + 1}. ${row.name}, ${row.label}${answered ? (right ? ', na správném místě' : `, ty jsi dal ${mine + 1}. místo`) : ''}. Klepnutím zobrazíš popis.`)}" class="flex min-h-[3.25rem] w-full items-center gap-2.5 rounded-2xl border-2 px-2.5 py-1.5 text-left transition-colors ${!answered ? 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-700' : right ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30' : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/25'}">
                            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${solidOf(ui.style)}" aria-hidden="true">${position + 1}</span>
                            ${thumb(row.photo, 'h-9 w-9')}
                            <span class="min-w-0 flex-1">
                                <span class="line-clamp-2 break-words text-[15px] font-bold leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(row.name)}</span>
                                ${row.detail ? `<span class="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(row.detail)}</span>` : ''}
                            </span>
                            <span class="flex shrink-0 flex-col items-end" aria-hidden="true">
                                <span class="text-sm font-black tabular-nums text-slate-800 dark:text-slate-100">${escapeHtml(row.label)}</span>
                                ${mark}
                            </span>
                        </button>
                    </li>`;
            }).join('');
            return `
            <div class="fade-in flex min-h-full w-full flex-col bg-slate-50 dark:bg-slate-900" data-numeric-result="order">
                <div class="flex flex-grow flex-col gap-4 p-4">
                    ${verdictHtml(round, ui, 'Správně!', score.base === MAX_BASE ? '' : 'Skoro!', 'Pořadí nesedí', line)}
                    <section class="${ui.card} p-3">
                        <h3 class="${ui.cardTitle} mb-1"><i data-lucide="hash" class="h-4 w-4 ${ui.style.text}"></i> Správné pořadí</h3>
                        <p class="mb-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">${escapeHtml(n.title)} · ${escapeHtml(n.detail)}</p>
                        <ol class="flex flex-col gap-2">${rows}</ol>
                        <p class="mt-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Klepnutím na položku se o ní dozvíš víc. Body: celé pořadí ${formatPoints(pointsFor(MAX_BASE, ui.variant))}, jedna prohozená sousední dvojice ${formatPoints(pointsFor(2, ui.variant))}.</p>
                    </section>
            ${footerHtml(ui)}`;
        }
        const guess = Number.isFinite(round.guess) ? round.guess : NaN;
        const score = round.score || scoreEstimate(data, guess);
        const has = Number.isFinite(guess) && !round.gaveUp;
        const words = ['Tentokrát vedle', 'Aspoň zhruba!', 'Dobrý odhad!', 'Skvělý odhad!', 'Výborně!'];
        const line = has ? `Tvůj odhad: ${formatGuess(data, guess)} · ${missText(data, guess)}` : `Správně: ${n.label}`;
        const row = n.item;
        return `
            <div class="fade-in flex min-h-full w-full flex-col bg-slate-50 dark:bg-slate-900" data-numeric-result="estimate">
                <div class="flex flex-grow flex-col gap-3 p-4">
                    ${verdictHtml(round, ui, words[MAX_BASE], score.base < MAX_BASE ? words[score.base] : '', words[0], line)}
                    <div class="flex items-center gap-3">
                        ${thumb(row.photo, 'h-12 w-12')}
                        <div class="min-w-0">
                            <span class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white ${ui.style.solid}"><i data-lucide="${escapeHtml(n.categoryIcon)}" class="h-3.5 w-3.5"></i> ${escapeHtml(n.categoryLabel || data.typeLabel)}</span>
                            <h1 class="mt-0.5 text-2xl font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(row.name)}</h1>
                            ${row.detail ? `<p class="truncate text-sm font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(row.detail)}</p>` : ''}
                        </div>
                    </div>
                    <section class="${ui.card} p-3">
                        <h3 class="${ui.cardTitle} mb-2"><i data-lucide="gauge" class="h-4 w-4 ${ui.style.text}"></i> ${escapeHtml(n.title)}</h3>
                        <dl class="grid grid-cols-2 gap-2">
                            <div class="rounded-xl bg-gold-500/15 px-2.5 py-1.5"><dt class="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Správně</dt><dd data-estimate-truth class="text-base font-black leading-tight tabular-nums text-slate-800 dark:text-slate-50">${escapeHtml(n.label)}</dd></div>
                            <div class="rounded-xl bg-sky-500/10 px-2.5 py-1.5"><dt class="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Tvůj odhad</dt><dd data-estimate-guess class="text-base font-black leading-tight tabular-nums text-slate-800 dark:text-slate-50">${has ? escapeHtml(formatGuess(data, guess)) : '–'}</dd></div>
                        </dl>
                        <div class="relative mt-2 h-24 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                            <div id="numeric-scale" class="absolute inset-0" role="img" aria-label="${escapeHtml(scaleSpec(data, has ? guess : NaN).describe)}"></div>
                        </div>
                        <p class="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Body: ${escapeHtml(ladderText(data, ui.variant))}.</p>
                    </section>
            ${footerHtml(ui, `<a href="${escapeHtml(ui.wikiUrl(row.title))}" target="_blank" rel="noopener noreferrer" class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"><i data-lucide="book-open" class="h-4 w-4"></i> Číst na Wikipedii</a>`)}`;
    };

    // --- V prohlížeči: dokreslení a ovládání (volá app.js) ---

    // Fotky jako pozadí (adresa souboru nejde podržením vyčíst) a stupnice odhadu
    const mount = (root, data, round, { Visuals, deps } = {}) => {
        if (!root || !isKind(data)) return;
        root.querySelectorAll('[data-numeric-photo]').forEach(element => {
            const url = element.dataset.numericPhoto;
            if (url) element.style.backgroundImage = `url("${url.replace(/["\\]/g, '\\$&')}")`;
        });
        const scale = root.querySelector('#numeric-scale');
        if (scale && Visuals) Visuals.render(scale, scaleSpec(data, Number.isFinite(round.guess) && !round.gaveUp ? round.guess : NaN), deps);
    };
    // Klepnutí na položku u „Seřaď“: další číslo, nebo zrušení čísla (ostatní se přečíslují); překreslí jen čísla a stav
    const togglePick = (round, index) => {
        const picked = pickedOf(round).filter(other => other !== index);
        round.pick = picked.length === pickedOf(round).length ? [...picked, index].slice(0, 4) : picked;
        return round.pick;
    };
    const paintOrder = (root, data, round, ui) => {
        if (!root || !isKind(data)) return;
        const picked = pickedOf(round);
        root.querySelectorAll('[data-action="order-pick"]').forEach(button => {
            const index = Number(button.dataset.index);
            const position = picked.indexOf(index);
            const row = data.numeric.items[index];
            button.className = position >= 0 ? `${ROW_ON} ${ui.style.on}` : ROW_OFF;
            button.setAttribute('aria-pressed', String(position >= 0));
            button.setAttribute('aria-label', orderLabel(row, position));
            const badge = button.querySelector('[data-order-badge]');
            if (badge) { badge.className = position >= 0 ? `${BADGE_ON} ${solidOf(ui.style)}` : BADGE_OFF; badge.textContent = position >= 0 ? String(position + 1) : ''; }
        });
        const status = root.querySelector('[data-order-status]');
        if (status) status.textContent = orderStatus(picked.length);
        const confirm = root.querySelector('[data-action="order-confirm"]');
        if (confirm) confirm.disabled = picked.length !== 4;
    };
    // Náhled čteného čísla pod polem (dlouhá čísla: „= 10 900 000 obyvatel“), chyba po odeslání
    const notePreview = (note, data, text, error = false) => {
        if (!note) return;
        const guess = readGuess(data, text);
        note.classList.toggle('text-rose-700', error);
        note.classList.toggle('dark:text-rose-300', error);
        if (error) { note.textContent = 'Napiš číslo, třeba 1 500.'; note.setAttribute('role', 'alert'); return; }
        note.removeAttribute('role');
        note.textContent = String(text || '').trim() && Number.isFinite(guess) ? `Tvůj odhad: ${formatGuess(data, guess)}` : noteText(data);
    };

    const api = {
        RATE, rate: START_RATE, force: null, MAX_BASE, SPECS, specsFor, UNITS, roundSig,
        isEligible, canEstimate, valueOf, farEnough, yearGap, plan, buildRound, isKind,
        pointsFor, scoreOrder, scoreEstimate, ladderFor, missText, ladderText, parseNumber, readGuess, formatGuess, scaleSpec,
        questionHtml, resultHtml, mount, togglePick, paintOrder, notePreview
    };
    return api;
});
