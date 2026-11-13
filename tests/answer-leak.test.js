// Odpověď se nesmí prozradit v popisu ani v nápovědách: zakrývají se všechny tvary jména (skloňování, přepisy, rodná jména).
// Jedna společná funkce (maskLeaks v quiz-core.js) pro všechna témata a druhy otázek; test na skutečných datech všech témat
// používá vzorek úvodů článků české Wikipedie (tests/wiki-intros.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../quiz-core.js');
const P = require('./pipeline.js');

// Zbytky jména po zakrytí: slova, která po odstranění diakritiky začínají jedním z kmenů
const plain = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const stems = (text, list) => list.filter(stem => plain(text).includes(stem));

test('krátké příjmení se zakryje i ve skloněném tvaru: Poe, Poea, Poeovi, Poeova', () => {
    const names = ['Edgar Allan Poe'];
    const text = 'Havran je jedna z nejznámějších básní významného amerického básníka Edgara Allana Poea. Poeovi přinesla slávu; Poeova báseň vyšla roku 1845.';
    const masked = core.maskLeaks(text, names, { lead: true });
    assert.deepEqual(stems(masked, ['poe']), [], masked);
    assert.match(masked, /^Havran je jedna z nejznámějších básní/);
    // Běžná slova podobná krátkému jménu zůstanou (poezie, poetika, Poznaň)
    assert.equal(core.maskLeaks('Poezie, poetika a Poznaň.', names), 'Poezie, poetika a Poznaň.');
    // Starý postup (jen zakrytí názvu) skloněné příjmení nechal
    assert.match(core.censorName(text, 'Edgar Allan Poe'), /Poea/);
});

test('všechny zápisy jména: Beneš = Beneș = Benes = Benesch, rodná jména a řada jmen', () => {
    const names = ['Carol Benesch'];
    const text = 'Benesch, Carol Benesch (také Carol Beneș nebo Carol Beneš) byl architekt. Karl Benesch Böhnich se narodil v Bukurešti, rodným jménem Karl Böhnich, německy Karl Benesch.';
    const masked = core.maskLeaks(text, names, { lead: true });
    assert.deepEqual(stems(masked, ['benes', 'carol', 'karl', 'bohnich']), [], masked);
    assert.match(masked, /byl architekt\./);
    assert.match(masked, /se narodil v Bukurešti/);
    // Opačně: v datech Beneš, v textu Benesch a Beneș
    const reversed = core.maskLeaks('Rodák Carol Benesch a Beneș.', ['Karel Beneš']);
    assert.deepEqual(stems(reversed, ['benes']), [], reversed);
    // Německé přepisy přehlásek a psaní bez diakritiky
    assert.deepEqual(stems(core.maskLeaks('Mueller i Müller a Muller.', ['Müller']), ['mu']), []);
    assert.deepEqual(stems(core.maskLeaks('Antonin Dvorak, Dvořák, Dvořákovi.', ['Antonín Dvořák']), ['dvor', 'anton']), []);
});

test('zakrývání nešetří běžná slova ani to, co hráč vidí v zadání', () => {
    // Obecná slova názvu zůstanou (park, řeka), římské číslice a předložky také
    const generic = (word) => ['park', 'národní'].includes(word.toLowerCase());
    assert.equal(core.maskLeaks('Národní park Šumava leží v Česku.', ['Národní park Šumava'], { isGeneric: generic }), 'Národní park [***] leží v Česku.');
    // Malé slovo ve víceslovném názvu je přívlastek: hudební skladatel zůstane, i když je odpovědí „hudební romantismus“
    assert.equal(core.maskLeaks('Byl to hudební skladatel romantismu.', ['hudební romantismus', 'romantismus']), 'Byl to hudební skladatel romantismu.');
    // Název díla vidí hráč v zadání (Kdo to napsal? Havran) a nezakrývá se
    // (dvě zakrytá místa oddělená jen čárkou jsou jeden blok)
    assert.equal(core.maskLeaks('Havran Poeův, Poe.', ['Edgar Allan Poe'], { keep: ['Havran'] }), 'Havran [***].');
    assert.equal(core.maskLeaks('Havran Poeův je slavný, Poe ho psal.', ['Edgar Allan Poe'], { keep: ['Havran'] }), 'Havran [***] je slavný, [***] ho psal.');
    assert.equal(core.maskLeaks('Havran je báseň.', ['Havran'], { keep: ['Havran'] }), 'Havran je báseň.');
    // Název série vedle autora se nezakryje (jen jména v řadě na začátku úvodu)
    assert.equal(core.maskLeaks('Kniha Letopisy Narnie Lewise.', ['Clive Staples Lewis']), 'Kniha Letopisy Narnie [***].');
    // Jiné osoby s příbuzným jménem nezmizí s ostatními větami: Nobelovu cenu zůstane
    assert.equal(core.maskLeaks('Se svým manželem Frédéricem Joliotem získala Nobelovu cenu.', ['Irène Joliot-Curie']), 'Se svým manželem Frédéricem [***] získala Nobelovu cenu.');
});

test('slova v popisu, která prozrazují odpověď, najde findLeaks', () => {
    assert.deepEqual(core.findLeaks('Poprvé vydal Poea roku 1845.', ['Edgar Allan Poe']).map(leak => leak.word), ['Poea']);
    assert.deepEqual(core.findLeaks('Dílo vyšlo v Praze.', ['Edgar Allan Poe']), []);
    // Fakt s odpovědí se jako nápověda nenabídne
    assert.equal(core.factRevealsAnswer({ label: 'Autor', value: 'Edgara Allana Poea' }, ['Edgar Allan Poe']), true);
    assert.equal(core.factRevealsAnswer({ label: 'Rok', value: '1845' }, ['Edgar Allan Poe']), false);
});

// Skutečná položka a zvláštní otázka tématu: u díla se ptá na autora, popis nesmí obsahovat žádný tvar jména autora
test('otázka „Kdo to napsal?“: autor se zakryje i ve skloněném tvaru, název díla zůstane', () => {
    const ctx = P.loadContext('literatura');
    const item = ctx.items.find(other => other.n === 'Havran');
    assert.ok(item);
    const question = P.questionsFor(ctx, item).find(q => q.type === 'author');
    assert.ok(question, 'Havran má otázku na autora');
    const extract = 'Havran je jedna z nejznámějších básní významného amerického básníka Edgara Allana Poea. Poprvé byla vydána 29. ledna 1845 v novinách New York Evening Mirror.';
    const texts = P.textsFor(ctx, item, question, extract);
    assert.deepEqual(stems(texts.questionText, ['poe']), [], texts.questionText);
    assert.match(texts.questionText, /^Havran je jedna z nejznámějších básní/);
    // Starý postup skloněné příjmení nechal
    assert.deepEqual(stems(P.legacyTextsFor(ctx, item, question, extract).questionText, ['poe']), ['poe']);
});

test('otázka na osobu: všechny tvary jména architekta, i rodné jméno', () => {
    const base = P.loadContext('architektura');
    const item = { q: 'Q999990', t: 'Carol Benesch', n: 'Carol Benesch', c: 'architekti', k: 0, ty: 'architekt', sx: 'm', d: 'rumunský architekt', f: { born: 1822, died: 1896, land: 'Rumunsko', y: 1860 } };
    const ctx = { ...base, items: [...base.items, item], genericWords: undefined, itemNames: undefined };
    const question = { type: 'name', title: 'Kdo to je?', showName: false, choices: [{ id: item.q, label: item.n, correct: true }], accepted: core.nameAnswers(item, []), answerLabel: item.n };
    const extract = 'Carol Benesch (Karl Böhnich Benesch) byl rumunský architekt. Narodil se jako Karl Benesch Böhnich ve Vídni, v Rumunsku používal jméno Carol Beneș. Je podepsán jako Benesch, Carol.';
    const texts = P.textsFor(ctx, item, question, extract);
    assert.deepEqual(stems(`${texts.questionText} ${texts.moreText}`, ['benes', 'carol', 'karl', 'bohnich']), [], `${texts.questionText} | ${texts.moreText}`);
    assert.match(texts.questionText, /byl rumunský architekt/);
});

test('popis, který je po zakrytí skoro samá mezera, se zahodí', () => {
    const ctx = P.loadContext('film');
    const item = ctx.items.find(other => other.n === 'Kmotr');
    const question = P.questionsFor(ctx, item)[0];
    const texts = core.buildQuestionTexts(item, ctx, question, { description: 'Kmotr Kmotr Kmotr Kmotr.', more: '', funFacts: [] });
    assert.equal(texts.questionText, '');
});

// --- Vlastnost na všech tématech: v zobrazeném popisu, dalších větách ani faktech nápověd není žádný token odpovědi ---
test('všechna témata: popis ani nápovědy neobsahují žádné slovo odpovědi (skutečné úvody Wikipedie)', () => {
    // Každý třetí článek vzorku (celý vzorek ověřuje skript při přípravě testu; tady kvůli rychlosti)
    const intros = P.loadIntros();
    let questions = 0;
    const failures = [];
    for (const [key, entry] of Object.entries(intros).filter((_, index) => index % 3 === 0)) {
        const [topicId, qid] = key.split(':');
        const ctx = P.loadContext(topicId);
        const item = ctx.byId.get(qid);
        if (!item) continue;
        for (const question of P.questionsFor(ctx, item)) {
            questions++;
            const shown = P.shownTextFor(ctx, item, question);
            const texts = P.textsFor(ctx, item, question, entry.extract);
            for (const [kind, text] of [['popis', texts.questionText], ['další věty', texts.moreText], ...texts.facts.map(fact => [`fakt ${fact.label}`, fact.value])]) {
                const leaked = P.leakedWords(text, texts.names, ctx, shown);
                if (leaked.length) failures.push(`${item.n} [${question.type}] ${kind}: ${leaked.join(', ')} – ${text}`);
            }
        }
    }
    assert.ok(questions >= 500, `vzorek má jen ${questions} otázek`);
    assert.deepEqual(failures.slice(0, 5), [], `${failures.length} úniků z ${questions} otázek`);
});

test('starý postup měl v tomto vzorku netěsnosti, nový žádné', () => {
    const intros = P.loadIntros();
    // Jen osoby a díla (tam odpověď prozrazují tvary jména nejčastěji); starý postup má v tomto vzorku netěsnosti, nový žádné
    let legacy = 0;
    let current = 0;
    for (const [key, entry] of Object.entries(intros).filter((_, index) => index % 2 === 0)) {
        const [topicId, qid] = key.split(':');
        if (!['literatura', 'hudba', 'sport', 'umeni'].includes(topicId)) continue;
        const ctx = P.loadContext(topicId);
        const item = ctx.byId.get(qid);
        if (!item) continue;
        for (const question of P.questionsFor(ctx, item)) {
            const shown = P.shownTextFor(ctx, item, question);
            const old = P.legacyTextsFor(ctx, item, question, entry.extract);
            const now = P.textsFor(ctx, item, question, entry.extract);
            if (P.leakedWords(old.questionText, old.names, ctx, shown).length) legacy++;
            if (P.leakedWords(now.questionText, now.names, ctx, shown).length) current++;
        }
    }
    assert.ok(legacy > 0, 'starý postup má ve vzorku aspoň jednu netěsnost (Poea u Havrana, sportovci…)');
    assert.equal(current, 0);
});

// --- Dobývání a hlavní hra: podmět úvodu je název, jiné názvy a původní jazyk, obecná slova druhu zůstanou ---
// Otázka „Co je to?“ se čtyřmi danými možnostmi (jako app.js createRoundData s options.wrong) a popis z daného úvodu článku
const describe = (topicId, qid, wrongIds, extract) => {
    const ctx = P.loadContext(topicId);
    const item = ctx.byId.get(qid);
    const others = wrongIds.map(id => ctx.byId.get(id));
    const category = P.categoryOf(ctx.topic, item.c);
    const question = { type: 'name', title: category.question || ctx.topic.words.question, showName: false, answerLabel: item.n,
        choices: [item, ...others].map(other => ({ id: other.q, label: other.n, correct: other === item })), accepted: [item.n] };
    const { questionText, moreText } = core.buildQuestionTexts(item, ctx, question, core.processWikiText(extract));
    return `${questionText} ${moreText}`.trim();
};

test('podmět úvodní věty je název: jeden blok i s „nebo také“ a původním názvem, „fotbalový stadion“ zůstane čitelný (Městský stadion v Poznani)', () => {
    // Skutečná otázka z Dobývání (Polsko): Městský stadion v Poznani | Městský stadion ve Vratislavi | PGE Arena | Slezský stadion
    const wrong = ['Q188706', 'Q182385', 'Q599592'];
    const text = 'Stadion Miejski nebo také INEA Stadion je fotbalový stadion v Poznani. Na tomto stadionu hraje své domácí zápasy polský fotbalový klub Lech Poznań.';
    assert.equal(describe('sport', 'Q188699', wrong, text),
        '[***] je fotbalový stadion [***]. Na tomto stadionu hraje své domácí zápasy polský fotbalový klub Lech [***].');
    // Úvod z Wikipedie i se závorkou (česky …) a dalšími větami: Miejski, INEA ani Poznań nikde, žádné „[***] [***]“
    const article = describe('sport', 'Q188699', wrong, 'Stadion Miejski (česky Městský stadion) nebo také INEA Stadion je fotbalový stadion v Poznani. Na tomto stadionu hraje své domácí zápasy polský fotbalový klub Lech Poznań. Rekordní návštěva byla v roce 1984 při zápase Lech Poznań – Widzew Łódź, kdy přišlo 45 000 diváků.');
    assert.match(article, /^\[\*\*\*\] je fotbalový stadion/);
    assert.doesNotMatch(article, /Miejski|INEA|Pozna|fotbalový \[\*\*\*\]|\[\*\*\*\]\s+\[\*\*\*\]/);
    // Původní název dál v textu se zakryje, obecné „Stadion“ ne
    const later = describe('sport', 'Q188699', wrong, 'Stadion Miejski nebo také INEA Stadion je fotbalový stadion v Poznani. Miejski byl otevřen v osmdesátých letech a INEA ho později přejmenovala. Stadion leží blízko řeky Warty.');
    assert.doesNotMatch(later, /Miejski|INEA/, later);
    assert.match(later, /Stadion leží blízko řeky Warty/, later);
});

test('jiné názvy odpovědi: katedrála (německy …), osobnost s přezdívkou a rodným jménem, řeka (latinsky …)', () => {
    // Katedrála svatého Petra v Kolíně nad Rýnem | v Řezně | Neuschwanstein | Katedrála svatého Víta v Praze
    const dom = describe('architektura', 'Q4176', ['Q280268', 'Q4152', 'Q5949'], 'Katedrála svatého Petra (německy Kölner Dom, krátce Kolínský dóm) je gotická katedrála v Kolíně nad Rýnem a sídlo kolínského arcibiskupa. Stojí na západním břehu Rýna. Kölner Dom patří k nejnavštěvovanějším památkám Německa.');
    assert.match(dom, /^\[\*\*\*\] je gotická katedrála/, dom);
    assert.doesNotMatch(dom, /Kölner|Kolín|kolín|Rýn/, dom);
    // Pelé | Neymar | Ronaldo | Ronaldinho: přezdívka je název, vlastní jméno se zakryje i dál v textu
    const pele = describe('sport', 'Q12897', ['Q142794', 'Q529207', 'Q39444'], 'Pelé, vlastním jménem Edson Arantes do Nascimento, byl brazilský fotbalista, který je často označován jako nejlepší fotbalista všech dob. Edson Arantes se narodil v Três Corações.');
    assert.match(pele, /^\[\*\*\*\] byl brazilský fotbalista/, pele);
    assert.doesNotMatch(pele, /Edson|Arantes|Nascimento|Pel/, pele);
    // Přezdívka dál v textu (úvody z Wikipedie): za čárkou ve větě se zakrytou odpovědí a ve větě bez podmětu; „oblast zvaná Arkádie“ ne
    const intro = (key) => P.loadIntros()[key].extract;
    const korbut = describe('sport', 'Q221575', ['Q10118', 'Q23448791', 'Q210879'], intro('sport:Q221575'));
    assert.match(korbut, /Byla často přezdívána \[\*\*\*\]\./, korbut);
    assert.doesNotMatch(korbut, /Vrabec|Minsk/, korbut);
    const pantani = describe('sport', 'Q273860', ['Q219912', 'Q155010', 'Q312322'], intro('sport:Q273860'));
    assert.match(pantani, /^\[\*\*\*\] byl italský profesionální cyklista, přezdívaný \[\*\*\*\]\./, pantani);
    const goat = describe('sport', 'Q7520267', ['Q10118', 'Q23448791', 'Q210879'], 'Simone Arianne Bilesová je americká sportovní gymnastka. Získala rovněž přezdívku G.O.A.T., z anglického „Greatest Of All Time“.');
    assert.match(goat, /Získala rovněž přezdívku \[\*\*\*\], z anglického/, goat);
    assert.equal(core.hideAnswer('[***] je nymfa. Žila v jižní oblasti Řecka zvané Arkádie.', { type: 'name', choices: [] }, { n: 'Pleione', t: 'Pleione' }, P.loadContext('mytologie')),
        '[***] je nymfa. Žila v jižní oblasti Řecka zvané Arkádie.');
    // Dlouhý podmět se všemi podobami jména je jeden blok (John Fitzgerald Kennedy, známý jako John F. Kennedy, J. F. Kennedy, Jack Kennedy či JFK)
    const jfk = describe('historie', 'Q9696', [], intro('historie:Q9696'));
    assert.match(jfk, /^\[\*\*\*\] byl americký politik/, jfk);
    assert.doesNotMatch(jfk, /JFK|Jack|Kennedy/, jfk);
    // Ferenc Puskás: přezdívka, maďarské pořadí jména a rodné jméno v závorce
    const puskas = describe('sport', 'Q482931', ['Q233572', 'Q667655', 'Q12897'], 'Ferenc Puskás, přezdívaný Cválající major (maďarsky Puskás Ferenc, rozený Purczeld Ferenc), byl maďarský fotbalista a trenér. Purczeld začínal v Kispestu.');
    assert.match(puskas, /^\[\*\*\*\] byl maďarský fotbalista a trenér/, puskas);
    assert.doesNotMatch(puskas, /Puskás|Purczeld|Ferenc|Cválající/, puskas);
    // Visla | Odra | Varta | Západní Bug: polský, německý a latinský název ze závorky zakrytý v celém textu, „řeka“ zůstane
    const visla = describe('zemepis', 'Q548', ['Q552', 'Q201823', 'Q156237'], 'Visla (polsky Wisła, německy Weichsel, latinsky Vistula) je nejdůležitější a nejdelší řeka v Polsku. Do Baltského moře se Wisła vlévá u Gdaňsku. Římané ji nazývali Vistula, Němci Weichsel.');
    assert.match(visla, /^\[\*\*\*\] je nejdůležitější a nejdelší řeka v Polsku/, visla);
    assert.doesNotMatch(visla, /Wis|Weichsel|Vistul/, visla);
});

test('podmět úvodu: druh před názvem zůstane, popisná přístavka také, věta s dalším slovesem se nezakryje celá; pojistka slov odpovědi', () => {
    assert.equal(core.leadSubject('Vlajka Ghany je list o poměru stran 2:3.', ['Ghana', 'Vlajka Ghany'], { label: 'Ghana' }).text, 'Vlajka [***] je list o poměru stran 2:3.');
    assert.equal(core.leadSubject('Vltava, nejdelší česká řeka, je řeka v Čechách.', ['Vltava']).text, '[***], nejdelší česká řeka, je řeka v Čechách.');
    assert.equal(core.leadSubject('Ladislav Pohrobek, nebo Holec z rodu Habsburků, byl český král.', ['Ladislav Pohrobek']).text, '[***] byl český král.');
    assert.equal(core.leadSubject('Ghana je stát.', ['Ghana']).text, '[***] je stát.');
    // Podmět bez názvu, s jiným slovesem nebo předložkou na začátku se nechá na běžném zakrývání
    assert.equal(core.leadSubject('Alexandrit patří mezi nejcennější drahokamy a je varietou chryzoberylu.', ['Alexandrit']), null);
    assert.equal(core.leadSubject('Nejvyšší horou Česka je Sněžka.', ['Sněžka']), null);
    assert.equal(core.leadSubject('V Poznani je fotbalový stadion.', ['Městský stadion v Poznani']), null);
    // Další názvy ze závorky úvodu (processWikiText): jen se značkou jazyka nebo jiného názvu, bez dat
    assert.deepEqual(core.processWikiText('Visla (polsky Wisła, německy Weichsel, latinsky Vistula) je nejdelší řeka v Polsku.').aliases, ['Wisła', 'Weichsel', 'Vistula']);
    assert.deepEqual(core.processWikiText('Ferenc Puskás (1. dubna 1927 Budapešť – 17. listopadu 2006 Budapešť) byl maďarský fotbalista.').aliases, []);
    // Pojistka: slovo správné možnosti, které nesprávné nemají, v textu nezůstane ani v jiném pádě (v Kolíně → Kolína, nad Rýnem → Rýna)
    const choices = [{ label: 'Katedrála svatého Petra v Kolíně nad Rýnem', correct: true }, { label: 'Katedrála svatého Petra v Řezně' }, { label: 'Neuschwanstein' }, { label: 'Katedrála svatého Víta v Praze' }];
    assert.equal(core.sealAnswerWords('Katedrála svatého Petra stojí blízko Rýna. Je sídlem kolínského arcibiskupa.', choices, { isGeneric: (word) => core.isGenericWord(word) }),
        'Katedrála svatého Petra stojí blízko [***]. Je sídlem [***] arcibiskupa.');
    // Nezávislá kontrola po zakrytí (Dobývání: jinak fakta nebo místní otázka): tvary výrazných slov správné možnosti, ne obecná slova,
    // slova nesprávných možností, slova zadání ani běžná slova se stejným začátkem malým písmenem (poznat u Poznaně)
    const isGeneric = (word) => core.isGenericWord(word);
    const stadium = [{ label: 'Městský stadion v Poznani', correct: true }, { label: 'Městský stadion ve Vratislavi' }, { label: 'PGE Arena' }, { label: 'Slezský stadion' }];
    assert.deepEqual(core.answerWordsLeft('[***] je fotbalový stadion [***]. Hraje tu Lech Poznań a poznaňští fanoušci ho poznají zdaleka.', stadium, { isGeneric }), ['Poznań', 'poznaňští']);
    assert.deepEqual(core.answerWordsLeft('[***] je fotbalový stadion [***]. Městský stadion je poznat zdaleka.', stadium, { isGeneric }), []);
    assert.deepEqual(core.answerWordsLeft('Stojí na západním břehu Rýna, v Kolíně. Je sídlem kolínského arcibiskupa.', choices, { isGeneric }), ['Rýna', 'Kolíně', 'kolínského']);
    assert.deepEqual(core.answerWordsLeft('Stojí na západním břehu Rýna.', choices, { isGeneric, keep: ['Která stavba stojí blízko Rýna?'] }), []);
    assert.deepEqual(core.answerWordsLeft(describe('sport', 'Q188699', ['Q188706', 'Q182385', 'Q599592'], 'Stadion Miejski nebo také INEA Stadion je fotbalový stadion v Poznani. Na tomto stadionu hraje své domácí zápasy polský fotbalový klub Lech Poznań.'), stadium, { isGeneric }), []);
});
