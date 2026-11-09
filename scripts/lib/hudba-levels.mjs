// Hudba: úrovně obtížnosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“) – stejný postup jako Literatura a Historie.
//
// Sláva = počet jazykových verzí článku; české a slovenské položky ×3 (čeští hráči je znají líp, než ukazuje počet verzí), k českému
// dílu se přičte desetina slávy autora. Skupiny, kterým roboti a fanoušci nafoukli počet verzí (asijský a latinskoamerický pop, ruská
// estráda, účastníci Eurovize), se tlumí na polovinu.
// Známé: vybraná jména (CZECH_KNOWN, KNOWN_WORKS) vždy, k tomu nejslavnější ~20–27 % kategorie – zvlášť mezi českými a slovenskými a mezi
// ostatními položkami – a nejslavnějších 25 % každého okruhu; okruh od 8 položek má aspoň max(3, 25 %) známých. Strop: méně slavné než
// minKnown známé není (do minima okruhu stačí 60 % stropu). NOT_KNOWN známé není nikdy. Od jednoho autora nejvýš 2 známá díla navíc
// k vybraným (u českého autora 1, kvůli okruhu u ostatních až 4).
// Expert: nejméně slavných 27 % kategorie (z českých a slovenských položek 12 %); v okruhu nejvýš 40 %. Ostatní = Mudrlant.
export const LEVELS = {
    skladatele: { known: 0.22, minKnown: 45, expert: 0.27 },
    hudebnici: { known: 0.15, minKnown: 50, expert: 0.27 },
    kapely: { known: 0.22, minKnown: 40, expert: 0.27 },
    dila: { known: 0.2, minKnown: 25, expert: 0.27 },
    opery: { known: 0.26, minKnown: 20, expert: 0.27 }
};
export const CZECH_BONUS = 3;
export const SLOVAK_BONUS = 3;
export const CZECH_EXPERT = 0.12;
export const OKRUH_KNOWN = 0.25;
export const OKRUH_FLOOR = 0.25;
export const OKRUH_EXPERT = 0.4;
export const FLOOR_RELAX = 0.6;
export const AUTHOR_SHARE = 0.1;
// Spodní hranice známých v okruhu (stejná jako u zeměpisu): od 8 položek aspoň max(3, 25 %)
export const knownFloor = (size) => size < 8 ? 0 : Math.min(size, Math.max(3, Math.ceil(size * OKRUH_FLOOR)));

// Nafouknutý počet jazykových verzí: K-pop, J-pop, C-pop, bollywood a ruská estráda mají články v desítkách jazyků, český hráč je ale nezná
const DAMPED_LANDS = /^(Jižní Korea|Japonsko|Čína|Tchaj-wan|Indie|Indonésie|Filipíny|Thajsko|Rusko|Sovětský svaz|Ukrajina|Bělorusko|Turecko|Ázerbájdžán|Arménie|Gruzie|Kazachstán|Írán|Egypt|Libanon|Mexiko|Malajsie)$/u;
const DAMPING = 0.5;
// Tlumí se jen populární hudba (zpěváci, kapely, jejich alba a písně) – ruští skladatelé (Musorgskij, Rimskij-Korsakov) slavní jsou
const isPopular = (item) => item.c === 'hudebnici' || item.c === 'kapely' || (item.c === 'dila' && ['album', 'pisen'].includes((item.f || {}).kind));

// items: položky tématu (c, cz, sk, f, g); options:
//   collections – okruhy [{ id }], sitelinksOf(item), isAlways(item), isNever(item), authorKeyOf(item) – autor díla (null u osob a kapel)
// Vrací { okruh: [povýšená jména] } pro výpis: položky, které se známými staly jen kvůli minimu okruhu.
export const assignLevels = (items, { collections, sitelinksOf, isAlways, isNever, isDamped = () => false, authorKeyOf }) => {
    const itemByQ = new Map(items.map(item => [item.q, item]));
    const baseFameOf = (item) => sitelinksOf(item) * (item.cz ? CZECH_BONUS : item.sk ? SLOVAK_BONUS : 1)
        * (!item.cz && isPopular(item) && DAMPED_LANDS.test((item.f || {}).land || '') ? DAMPING : 1) * (isDamped(item) ? DAMPING : 1);
    const fameCache = new Map();
    const fameOf = (item) => {
        if (!fameCache.has(item.q)) {
            let fame = baseFameOf(item);
            // České dílo má článek jen v pár jazycích, i když ho zná každý ze školy (Jakobín, Krysař) – přičte se desetina slávy autora
            const author = item.cz && item.f && item.f.byq ? itemByQ.get(item.f.byq) : null;
            if (author) fame += AUTHOR_SHARE * baseFameOf(author);
            fameCache.set(item.q, fame);
        }
        return fameCache.get(item.q);
    };
    const byFameDesc = (list) => [...list].sort((a, b) => fameOf(b) - fameOf(a));
    const knownByAuthor = new Map();
    const canBeKnown = (item, minFame, perAuthor) => {
        if (item.k === 1 || isNever(item) || fameOf(item) < minFame) return false;
        const author = authorKeyOf(item);
        return !author || (knownByAuthor.get(author) || 0) < perAuthor;
    };
    // Vybraná díla se do počtu na autora nepočítají (u Janáčka jsou tři vybraná, Věc Makropulos se může přidat)
    const makeKnown = (item, always = false) => {
        item.k = 1;
        const author = authorKeyOf(item);
        if (author && !always) knownByAuthor.set(author, (knownByAuthor.get(author) || 0) + 1);
    };
    for (const item of items) {
        delete item.x;
        item.k = 0;
    }
    for (const item of items) if (isAlways(item)) makeKnown(item, true);
    // Kategorie zvlášť pro české, slovenské a ostatní položky – česká a slovenská jména se tak s cizími nepřetahují o počet jazykových verzí
    // Slovák s československým občanstvím (Marián Varga, Jana Kirschner) patří mezi slovenské položky
    const homeOf = (item) => item.sk ? 'sk' : item.cz ? 'cz' : '';
    const strata = (category) => ['cz', 'sk', ''].map(home => items.filter(item => item.c === category && homeOf(item) === home)).filter(list => list.length);
    for (const [category, level] of Object.entries(LEVELS)) {
        for (const stratum of strata(category)) {
            let known = stratum.filter(item => item.k === 1).length;
            for (const item of byFameDesc(stratum)) {
                if (known >= Math.round(level.known * stratum.length)) break;
                // U českého autora jen jedno dílo navíc (Dvořák: k Rusalce, Jakobínovi a Čertu a Káče ne ještě Alfred)
                if (canBeKnown(item, level.minKnown, item.cz ? 1 : 2)) {
                    makeKnown(item);
                    known++;
                }
            }
        }
    }
    const promoted = {};
    const inOkruh = (collection) => items.filter(item => (item.g || []).includes(collection.id));
    for (const collection of collections) {
        const members = byFameDesc(inOkruh(collection));
        if (members.length < 8) continue;
        // Nejdřív slavné nad stropem, do minima okruhu i méně slavné (aspoň 60 % stropu)
        for (const [share, relax] of [[OKRUH_KNOWN, 1], [OKRUH_FLOOR, FLOOR_RELAX]]) {
            const target = Math.min(members.length, Math.max(3, Math.ceil(share * members.length)));
            let known = members.filter(item => item.k === 1).length;
            for (const item of members) {
                if (known >= target) break;
                if (canBeKnown(item, LEVELS[item.c].minKnown * relax, item.cz ? 1 : 4)) {
                    makeKnown(item);
                    known++;
                    if (relax < 1) (promoted[collection.id] ||= []).push(item.n);
                }
            }
        }
    }
    for (const [category, level] of Object.entries(LEVELS)) {
        for (const stratum of strata(category)) {
            const rest = byFameDesc(stratum.filter(item => item.k !== 1)).reverse();
            const share = homeOf(stratum[0]) ? CZECH_EXPERT : level.expert;
            for (const item of rest.slice(0, Math.round(share * stratum.length))) item.x = 1;
        }
    }
    // Okruh nesmí být z víc než 40 % expertní: nejslavnější z expertních se vrátí do Mudrlanta
    for (const collection of collections) {
        const members = inOkruh(collection);
        const experts = byFameDesc(members.filter(item => item.x));
        const over = experts.length - Math.floor(OKRUH_EXPERT * members.length);
        for (const item of experts.slice(0, Math.max(0, over))) delete item.x;
    }
    return promoted;
};
