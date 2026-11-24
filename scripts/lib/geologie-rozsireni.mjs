// Téma Geologie, rozšíření o přírodní katastrofy a podnebí: nové kategorie Přírodní katastrofy (katastrofy), Podnebí a klima (klima)
// a v menší míře Počasí a oblaka (pocasi), ať téma nepůsobí jako meteorologie.
// Používá build-geologie.mjs: na konci celého sestavení, nebo samostatně nad hotovým data/geologie.json (GEOLOGIE_ONLY=rozsireni) –
// ostatní položky se nestahují ani nemění (id, kategorie, úroveň i okruhy zůstanou).
//
// Kandidáti: ruční seznamy podle ID Wikidat (vybrané z tříd zemětřesení, tropická cyklóna, povodeň, podnebí, vítr, oblak… a z českých
// názvů článků, jen s článkem na české Wikipedii). Položky, které už má jiné téma (data/*.json), se vynechají: slavná zemětřesení,
// hurikány a výbuchy sopek z Historie (Lisabon 1755, Haiti 2010, Katrina, Vesuv 79…), sopky ze Zeměpisu (Vesuv, Pinatubo, Tambora,
// Mount St. Helens…), skleníkový efekt, duha, blesk a polární záře z Fyziky.
// Rok, země, oběti, magnitudo, kategorie hurikánu a síla erupce jsou ručně (podle Wikipedie; Wikidata mají oběti často bez nezvěstných
// nebo jen za jednu zemi), poloha a fotka z Wikidat. Fotka jen skutečná (ne mapa, schéma ani družicová koláž).
// Známost: pořadí podle jazykových verzí a návštěvnosti české Wikipedie v kategorii (lib/fame-levels.mjs), ne obskurní pojmy.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { qlever, id, values, imageFields, compact, cached, inBatches } from './wikidata.mjs';
import { topicPageviews, assignLevels, knownFloor, EXPERT_MAX_SHARE } from './fame-levels.mjs';

const { isRealPhoto } = createRequire(import.meta.url)('../../quiz-core.js');

export const EXTRA_CATEGORIES = ['katastrofy', 'klima', 'pocasi'];

// --- Přírodní katastrofy: [ID, druh, údaje] ---
// year = rok (yt = text, když trvala déle), land = zasažená země (hlavní), dead = počet obětí (dp = „asi“ či „přes“, když je číslo odhad),
// mag = momentové magnitudo, cat = kategorie hurikánu na Saffirově–Simpsonově stupnici, vei = index vulkanické explozivity,
// note = zajímavost (bez názvu, země a roku), cz = česká stopa
const KATASTROFY = [
    // Zemětřesení a tsunami
    ['Q36204', 'zemětřesení', { year: 2011, land: 'Japonsko', dead: 18500, dp: 'asi', mag: 9.0, note: 'obří vlna zničila jadernou elektrárnu Fukušima I' }],
    ['Q116691303', 'zemětřesení', { year: 2023, land: 'Turecko a Sýrie', dead: 59000, dp: 'přes', mag: 7.8, note: 'dva silné otřesy během jednoho dne, zřítily se desetitisíce domů' }],
    ['Q133574091', 'zemětřesení', { year: 2025, land: 'Myanmar', dead: 3800, dp: 'asi', mag: 7.7, note: 'otřesy zbořily i rozestavěný mrakodrap v Bangkoku' }],
    ['Q122351413', 'zemětřesení', { year: 2023, land: 'Maroko', dead: 2960, mag: 6.8, note: 'epicentrum v pohoří Vysoký Atlas, poškodilo i Marrákeš' }],
    ['Q131692964', 'zemětřesení', { year: 2025, land: 'Čína', dead: 126, mag: 7.1, note: 'zasáhlo okolí města Šigace pod Himálajem' }],
    ['Q151850', 'zemětřesení', { year: 2011, land: 'Nový Zéland', dead: 185, mag: 6.2, note: 'zničilo centrum druhého největšího města země i jeho katedrálu' }],
    ['Q207918', 'zemětřesení', { year: 2009, land: 'Itálie', dead: 309, mag: 6.3, note: 'vědci byli za podcenění rizika nejprve odsouzeni, později osvobozeni' }],
    ['Q367449', 'zemětřesení', { year: 1999, land: 'Turecko', dead: 17000, dp: 'přes', mag: 7.6, note: 'zasáhlo průmyslové okolí Istanbulu na Severoanatolském zlomu' }],
    ['Q189079', 'zemětřesení', { year: 2011, land: 'Turecko', dead: 604, mag: 7.1, note: 'zasáhlo okolí jezera Van na východě země' }],
    ['Q108091634', 'zemětřesení', { year: 2021, land: 'Haiti', dead: 2250, mag: 7.2, note: 'přišlo jedenáct let po ničivém otřesu, který zbořil prezidentský palác' }],
    ['Q23825118', 'zemětřesení', { year: 2016, land: 'Japonsko', dead: 270, mag: 7.0, note: 'poškodilo hrad na ostrově Kjúšú' }],
    ['Q88259708', 'zemětřesení', { year: 2020, land: 'Chorvatsko', dead: 1, mag: 5.5, note: 'poškodilo katedrálu v hlavním městě uprostřed pandemie covidu' }],
    ['Q104535090', 'zemětřesení', { year: 2020, land: 'Chorvatsko', dead: 7, mag: 6.4, note: 'otřesy byly cítit i v Česku' }],
    ['Q210981', 'zemětřesení', { year: 2007, land: 'Peru', dead: 519, mag: 8.0, note: 'zničilo přístavní město Pisco' }],
    ['Q56768333', 'zemětřesení', { year: 2018, land: 'Indonésie', dead: 4340, mag: 7.5, note: 'tsunami a ztekucení půdy zničily město Palu' }],
    ['Q23835355', 'zemětřesení', { year: 2016, land: 'Ekvádor', dead: 676, mag: 7.8, note: 'nejhorší katastrofa země od 70. let' }],
    ['Q38982786', 'zemětřesení', { year: 2017, land: 'Mexiko', dead: 98, mag: 8.2, note: 'nejsilnější otřes v zemi za sto let, epicentrum v Tichém oceánu' }],
    ['Q40355642', 'zemětřesení', { year: 2017, land: 'Mexiko', dead: 370, mag: 7.1, note: 'přišlo přesně 32 let po ničivém otřesu metropole z roku 1985' }],
    ['Q1798567', 'zemětřesení', { year: 1985, land: 'Mexiko', dead: 10000, dp: 'asi', mag: 8.0, note: 'jezerní usazeniny pod metropolí otřesy zesílily, odhady obětí se liší od 5 000 do 40 000' }],
    ['Q749610', 'zemětřesení', { year: 1964, land: 'Spojené státy', dead: 131, mag: 9.2, note: 'nejsilnější zaznamenané zemětřesení Severní Ameriky, na Velký pátek' }],
    ['Q714320', 'zemětřesení', { year: 1999, land: 'Tchaj-wan', dead: 2415, mag: 7.7, note: 'nejničivější otřes ostrova ve 20. století' }],
    ['Q274498', 'zemětřesení', { year: 1923, land: 'Japonsko', dead: 105000, dp: 'asi', mag: 7.9, note: 'většinu obětí v Tokiu a Jokohamě způsobily požáry' }],
    ['Q135502884', 'zemětřesení', { year: 2025, land: 'Rusko', mag: 8.8, note: 'jedno z nejsilnějších zaznamenaných zemětřesení, tsunami se varovalo v celém Tichomoří' }],
    ['Q1735004', 'zemětřesení', { year: 1700, land: 'Spojené státy a Kanada', mag: 9.0, note: 'datum je známé díky japonským záznamům o tsunami, které připlulo přes Tichý oceán' }],
    ['Q672705', 'zemětřesení', { year: 1356, land: 'Švýcarsko', note: 'nejsilnější známé zemětřesení ve střední Evropě, zničilo město na Rýně' }],
    ['Q136033573', 'zemětřesení', { year: 2025, land: 'Afghánistán', dead: 2200, mag: 6.0, note: 'zasáhlo horské vesnice u hranic s Pákistánem' }],
    ['Q22662663', 'zemětřesení', { year: 2016, land: 'Tchaj-wan', dead: 117, mag: 6.4, note: 'většina obětí zahynula v jednom zříceném obytném domě' }],
    ['Q55974069', 'zemětřesení', { year: 2018, land: 'Indonésie', dead: 560, mag: 6.9, note: 'série otřesů zasáhla ostrov sousedící s Bali' }],
    ['Q60042839', 'tsunami', { year: 2018, land: 'Indonésie', dead: 429, note: 'vlnu způsobil sesuv svahu sopky Anak Krakatau, zasáhla i koncert na pláži' }],
    // Sopky slavné erupcí (sopky, které má Zeměpis, tu nejsou)
    ['Q82613', 'sopka', { year: 1883, land: 'Indonésie', dead: 36000, dp: 'asi', vei: 6, note: 'výbuch byl slyšet 4 800 km daleko, většinu obětí způsobilo tsunami' }],
    ['Q203726', 'sopka', { year: 1783, yt: '1783–1784', land: 'Island', dead: 9000, dp: 'asi', vei: 4, note: 'puklinová erupce, jedovaté plyny a hladomor zabily pětinu obyvatel ostrova' }],
    ['Q39651', 'sopka', { year: 2010, land: 'Island', dead: 0, vei: 4, note: 'sopečný popel pod ledovcem ochromil leteckou dopravu nad Evropou' }],
    ['Q3143318', 'sopka', { year: 2022, land: 'Tonga', dead: 6, vei: 6, note: 'nejsilnější výbuch 21. století, tlaková vlna oběhla Zemi několikrát' }],
    ['Q188698', 'sopka', { year: 2018, land: 'Spojené státy', dead: 0, vei: 3, note: 'jedna z nejaktivnějších sopek světa, láva zničila přes 700 domů' }],
    ['Q650836', 'sopka', { yt: 'před 640 000 lety', land: 'Spojené státy', vei: 8, note: 'supervulkán pod slavným národním parkem s gejzíry' }],
    ['Q2071883', 'sopka', { yt: 'asi 1600 př. n. l.', land: 'Řecko', vei: 7, note: 'mohutná erupce v době bronzové oslabila mínojskou Krétu' }],
    // Hurikány, tajfuny a cyklóny
    ['Q38685186', 'hurikán', { year: 2017, land: 'Karibik a Florida', dead: 134, cat: 5, note: 'nejsilnější atlantický hurikán mimo Karibské moře a Mexický záliv do té doby' }],
    ['Q37933184', 'hurikán', { year: 2017, land: 'Spojené státy (Texas)', dead: 107, cat: 4, note: 'rekordní srážky zaplavily Houston' }],
    ['Q186291', 'hurikán', { year: 1780, land: 'Malé Antily', dead: 22000, dp: 'asi', note: 'nejsmrtelnější známý atlantický hurikán' }],
    ['Q27058656', 'hurikán', { year: 2016, land: 'Haiti', dead: 603, cat: 5 }],
    ['Q40178187', 'hurikán', { year: 2017, land: 'Portoriko a Dominika', dead: 3000, dp: 'asi', cat: 5, note: 'Portoriko zůstalo měsíce bez elektřiny' }],
    ['Q66764432', 'hurikán', { year: 2019, land: 'Bahamy', dead: 84, cat: 5, note: 'stál nad ostrovy skoro dva dny' }],
    ['Q130428849', 'hurikán', { year: 2024, land: 'Spojené státy (Florida)', dead: 35, cat: 5, note: 'zesílil rekordně rychle v Mexickém zálivu' }],
    ['Q57082056', 'hurikán', { year: 2018, land: 'Spojené státy (Florida)', dead: 74, cat: 5 }],
    ['Q130358528', 'hurikán', { year: 2024, land: 'Spojené státy', dead: 250, cat: 4, note: 'nejvíc obětí způsobily povodně v horách Severní Karolíny' }],
    ['Q108300283', 'hurikán', { year: 2021, land: 'Spojené státy (Louisiana)', dead: 107, cat: 4, note: 'zbytky bouře zaplavily i New York' }],
    ['Q186166', 'hurikán', { year: 1900, land: 'Spojené státy (Texas)', dead: 8000, dp: 'asi', cat: 4, note: 'nejsmrtelnější přírodní katastrofa v dějinách USA, odhady obětí 6 000 až 12 000' }],
    ['Q15136651', 'tajfun', { year: 2013, land: 'Filipíny', dead: 6300, dp: 'přes', cat: 5, note: 'jedna z nejsilnějších tropických cyklón, které kdy dosáhly pevniny' }],
    ['Q56530829', 'tajfun', { year: 2018, land: 'Filipíny a Čína', dead: 134, cat: 5 }],
    ['Q130214931', 'tajfun', { year: 2024, land: 'Vietnam', dead: 840, cat: 5 }],
    ['Q634171', 'tajfun', { year: 1979, land: 'Japonsko', dead: 99, cat: 5, note: 'největší a nejhlubší zaznamenaná tropická cyklóna, tlak 870 hPa' }],
    ['Q714611', 'tajfun', { year: 2009, land: 'Tchaj-wan', dead: 790, note: 'přinesl na Tchaj-wan téměř 3 metry srážek' }],
    ['Q716334', 'tajfun', { year: 1975, land: 'Čína', dead: 26000, dp: 'přes', note: 'srážky protrhly přehradu Pan-čchiao, odhady obětí i s hladomorem sahají až ke 230 000' }],
    ['Q100986340', 'tajfun', { year: 2020, land: 'Filipíny', dead: 31, cat: 5 }],
    ['Q152314', 'cyklón', { year: 2008, land: 'Myanmar', dead: 138000, dp: 'asi', note: 'vlna z moře zaplavila deltu Iravadi' }],
    ['Q62023294', 'cyklón', { year: 2019, land: 'Mosambik, Zimbabwe a Malawi', dead: 1600, note: 'zaplavil město Beira' }],
    ['Q63399407', 'cyklón', { year: 2019, land: 'Indie a Bangladéš', dead: 89, note: 'před bouří se evakuovalo přes milion lidí' }],
    // Povodně, bouře a další katastrofy počasí
    ['Q86929', 'povodeň', { year: 2002, land: 'Česko, Německo a Rakousko', note: 'Vltava zaplavila pražské metro, Labe zatopilo Drážďany', cz: 1 }],
    ['Q315494', 'povodeň', { year: 1997, land: 'Česko, Polsko a Německo', dead: 114, note: 'zatopila Ostravu, Olomouc a Troubky, říká se jí „povodeň století“', cz: 1 }],
    ['Q130297776', 'povodeň', { year: 2024, land: 'Česko, Polsko, Rakousko a Rumunsko', dead: 27, note: 'přinesla ji tlaková níže Boris, zasáhla Jeseníky a Opavsko', cz: 1 }],
    ['Q107529288', 'povodeň', { year: 2021, land: 'Německo a Belgie', dead: 243, note: 'nejvíc zasáhla údolí řeky Ahr' }],
    ['Q130731262', 'povodeň', { year: 2024, land: 'Španělsko', dead: 232, note: 'přívalové deště zaplavily předměstí Valencie' }],
    ['Q3005548', 'povodeň', { year: 1910, land: 'Francie', note: 'Seina zaplavila hlavní město na více než měsíc, lidé se pohybovali po lávkách' }],
    ['Q122311648', 'bouře', { year: 2023, land: 'Libye a Řecko', dead: 5900, dp: 'přes', note: 'protrhla dvě přehrady nad městem Derna, tisíce lidí jsou nezvěstné' }],
    ['Q939336', 'bouře', { year: 2007, land: 'Evropa', dead: 47, note: 'orkán polámal miliony stromů i v českých lesích', cz: 1 }],
    ['Q107339234', 'tornádo', { year: 2021, land: 'Česko', dead: 6, note: 'nejsilnější tornádo v dějinách země, zničilo části Hrušek, Mikulčic a Moravské Nové Vsi', cz: 1 }],
    ['Q1136557', 'vlna veder', { year: 2003, land: 'Evropa', dead: 70000, dp: 'asi', note: 'nejvíc obětí ve Francii a Itálii' }],
    ['Q77924746', 'požár', { year: 2019, yt: '2019–2020', land: 'Austrálie', dead: 34, note: 'shořelo přes 18 milionů hektarů, uhynuly asi 3 miliardy zvířat' }],
    ['Q726501', 'sucho', { year: 1930, yt: '30. léta 20. století', land: 'Spojené státy', note: 'prachové bouře z vyschlých prérií vyhnaly statisíce farmářů' }],
    // Stupnice síly
    ['Q38768', 'stupnice', { by: 'Charles Richter', year: 1935, sc: 'magnitudo zemětřesení', rng: 'otevřená, každý stupeň je asi 32krát víc energie' }],
    ['Q170350', 'stupnice', { by: 'Giuseppe Mercalli', year: 1902, sc: 'účinky otřesů na lidi a budovy', rng: 'I–XII' }],
    ['Q205801', 'stupnice', { by: 'Herbert Saffir a Robert Simpson', year: 1971, sc: 'hurikány podle rychlosti větru', rng: '1–5' }],
    ['Q380770', 'stupnice', { by: 'Tecuja Fudžita', year: 1971, sc: 'tornáda podle škod', rng: 'F0–F5' }],
    ['Q170464', 'stupnice', { by: 'Francis Beaufort', year: 1805, sc: 'vítr na souši i na moři', rng: '0–12' }]
];

// --- Podnebí a klima: [ID, druh, údaje] ---
// kop = značka v Köppenově klasifikaci, where = kde je, feat = typické znaky (bez názvu), note = zajímavost
const KLIMA = [
    // Podnebné pásy
    ['Q42530', 'podnebný pás', { where: 'kolem rovníku', feat: 'teplo po celý rok, střídání období dešťů a sucha' }],
    ['Q10374615', 'podnebný pás', { where: 'zhruba mezi 25. a 40. rovnoběžkou', feat: 'horká suchá léta, mírné zimy, patří sem pouště i Středomoří' }],
    ['Q167466', 'podnebný pás', { where: 'středních zeměpisných šířek, i Česko', feat: 'čtyři roční období' }],
    ['Q1342399', 'podnebný pás', { where: 'kolem 60. rovnoběžky, sever Eurasie a Kanady', feat: 'krátká chladná léta a dlouhé mrazivé zimy, tajga a tundra' }],
    ['Q193372', 'podnebný pás', { where: 'Arktida a Antarktida, za 66. rovnoběžkou', feat: 'průměrná teplota nejteplejšího měsíce pod 10 °C' }],
    // Typy podnebí
    ['Q209531', 'typ podnebí', { kop: 'Af', where: 'Amazonie, Kongo, Indonésie', feat: 'horko a vydatné deště po celý rok, bez ročních období' }],
    ['Q863882', 'typ podnebí', { kop: 'Am', where: 'Indie, Bangladéš, západní Afrika', feat: 'krátké suché období a velmi deštivé léto' }],
    ['Q113562', 'typ podnebí', { kop: 'Aw', where: 'východní Afrika, Brazílie, severní Austrálie', feat: 'teplo celý rok, výrazné období dešťů a sucha' }],
    ['Q190946', 'typ podnebí', { kop: 'BW', where: 'Sahara, Arabský poloostrov, Atacama', feat: 'srážek je mnohem méně, než se může vypařit' }],
    ['Q124196', 'typ podnebí', { kop: 'BS', where: 'okraje pouští, Sahel, vnitrozemí Asie', feat: 'málo srážek, travnatá krajina bez stromů' }],
    ['Q13996', 'typ podnebí', { kop: 'Cs', where: 'jižní Evropa, Kalifornie, okolí Kapského Města', feat: 'horká suchá léta a mírné deštivé zimy' }],
    ['Q864320', 'typ podnebí', { kop: 'Cfa', where: 'jihovýchod USA, jižní Čína, Buenos Aires', feat: 'horká vlhká léta a mírné zimy' }],
    ['Q182090', 'typ podnebí', { kop: 'Cfb', where: 'západní Evropa, Nový Zéland', feat: 'mírná léta i zimy a srážky po celý rok vlivem moře' }],
    ['Q185005', 'typ podnebí', { where: 'vnitrozemí Eurasie a Severní Ameriky', feat: 'velké rozdíly teplot mezi létem a zimou, málo srážek' }],
    ['Q589326', 'typ podnebí', { kop: 'Dfa, Dfb', where: 'východní Evropa, okolí Velkých jezer', feat: 'teplá léta a studené zasněžené zimy' }],
    ['Q5967371', 'typ podnebí', { kop: 'Dfc', where: 'Sibiř, Kanada, sever Skandinávie', feat: 'krátká léta, velmi dlouhé a mrazivé zimy' }],
    ['Q5985406', 'typ podnebí', { kop: 'EF', where: 'Antarktida, vnitrozemí Grónska', feat: 'teplota ani v létě nevystoupí nad bod mrazu' }],
    // Biomy (krajina podle podnebí)
    ['Q43262', 'biom', { where: 'sever Sibiře, Kanady a Aljašky', feat: 'mechy, lišejníky a zakrslé keře na trvale zmrzlé půdě' }],
    ['Q69564', 'biom', { where: 'Sibiř, Kanada, Skandinávie', feat: 'rozlehlé jehličnaté lesy subpolárního pásu' }],
    ['Q42320', 'biom', { where: 'východní a jižní Afrika, Brazílie, severní Austrálie', feat: 'tráva s roztroušenými stromy, období dešťů a sucha' }],
    ['Q123991', 'biom', { where: 'Ukrajina, Kazachstán, Mongolsko', feat: 'travnatá krajina bez stromů v mírném pásu' }],
    ['Q8514', 'biom', { where: 'Sahara, Gobi, Atacama', feat: 'méně než 250 mm srážek za rok, řídká nebo žádná vegetace' }],
    ['Q199403', 'biom', { where: 'Amazonie, povodí Konga, jihovýchodní Asie', feat: 'nejvíc druhů rostlin a živočichů na Zemi, několik pater stromů' }],
    ['Q194281', 'biom', { where: 'střed Severní Ameriky', feat: 'travnaté pláně, dnes většinou pole kukuřice a pšenice' }],
    ['Q184382', 'biom', { where: 'Argentina a Uruguay', feat: 'travnatá rovina, domov gaučů a stád dobytka' }],
    ['Q2492828', 'biom', { where: 'mezi tajgou a tundrou', feat: 'přechod lesa v holou severskou krajinu, řídké zakrslé stromy' }],
    ['Q840819', 'biom', { where: 'jih Ruska, Ukrajina, Kazachstán', feat: 'střídání listnatých hájů a travnatých plání' }],
    ['Q144012', 'biom', { where: 'pobřeží Středozemního moře, Kalifornie', feat: 'stálezelené keře a nízké stromy (dub korkový, olivovník), které přečkají suché léto' }],
    // Klimatické jevy a cirkulace
    ['Q7939', 'klimatický jev', { where: 'Tichý oceán u Jižní Ameriky', feat: 'oteplení povrchu oceánu jednou za několik let, mění počasí na půlce světa', note: 'rybáři ho pojmenovali podle Ježíška, protože přichází kolem Vánoc' }],
    ['Q642867', 'klimatický jev', { where: 'Tichý oceán u Jižní Ameriky', feat: 'ochlazení povrchu oceánu, opak častějšího jevu se jménem chlapce' }],
    ['Q42967', 'klimatický jev', { where: 'jižní a jihovýchodní Asie', feat: 'vítr, který mění směr podle ročního období: v létě přináší vydatné deště' }],
    ['Q160603', 'klimatický jev', { where: 'mezi obratníky a rovníkem', feat: 'stálý vítr vanoucí celý rok k rovníku, plachetnice ho využívaly k plavbě do Ameriky' }],
    ['Q1137345', 'klimatický jev', { where: 'mezi Islandem a Azorami', feat: 'kolísání tlaku, které rozhoduje o mírné nebo tuhé zimě v Evropě' }],
    ['Q202325', 'klimatický jev', { where: 'horní troposféra ve výšce 9–12 km', feat: 'úzký pás velmi rychlého západního větru, letadla s ním šetří palivo' }],
    ['Q753858', 'klimatický jev', { where: 'kolem rovníku', feat: 'pás nízkého tlaku, kde se sbíhají pasáty a vznikají bouřky' }],
    ['Q338589', 'klimatický jev', { where: 'mezi rovníkem a 30. rovnoběžkou', feat: 'oběh vzduchu: u rovníku stoupá, u obratníků klesá a vytváří pouště' }],
    ['Q1197111', 'klimatický jev', { where: 'nad Arktidou a Antarktidou', feat: 'obří tlaková níže, jejíž oslabení pouští mráz daleko na jih' }],
    ['Q304575', 'klimatický jev', { where: 'jižní polokoule v pásu kolem Antarktidy', feat: 'silné západní větry, které nic nebrzdí, obávané námořníky' }],
    ['Q3117517', 'klimatický jev', { where: 'tropy', feat: 'část roku s vydatnými srážkami' }],
    ['Q215712', 'klimatický jev', { where: 'metropole a jejich centra', feat: 'v ulicích je hlavně v noci o několik stupňů víc než v okolní krajině' }],
    // Změny klimatu
    ['Q7942', 'změna klimatu', { feat: 'vzestup průměrné teploty Země od konce 19. století', note: 'hlavní příčinou jsou skleníkové plyny ze spalování fosilních paliv' }],
    ['Q49367', 'změna klimatu', { feat: 'dlouhé chladné období, kdy obří příkrovy zakrývaly sever Evropy a Ameriky', note: 'ta poslední skončila asi před 11 700 lety' }],
    ['Q190530', 'změna klimatu', { feat: 'chladnější období asi od 14. do 19. století', note: 'v Londýně zamrzala Temže a konaly se na ní trhy' }],
    ['Q498819', 'změna klimatu', { feat: 'teplé období asi v letech 950–1250', note: 'Vikingové tehdy osídlili Grónsko' }],
    ['Q211446', 'změna klimatu', { feat: 'pravidelné změny oběžné dráhy a sklonu osy Země, které střídají doby ledové a meziledové', note: 'popsal je srbský astronom' }],
    ['Q209625', 'změna klimatu', { feat: 'rok 1816, kdy v Evropě a Severní Americe sněžilo i v červnu a červenci', note: 'způsobil ho popel z výbuchu indonéské sopky Tambora' }],
    ['Q602963', 'změna klimatu', { feat: 'chladná část doby ledové, kdy postupují ledovce', note: 'opakem je meziledová doba (interglaciál)' }],
    ['Q167336', 'změna klimatu', { feat: 'látky v atmosféře, které zadržují teplo: oxid uhličitý, metan, vodní pára' }],
    ['Q183140', 'změna klimatu', { where: 'nad Antarktidou', feat: 'úbytek plynu, který chrání Zemi před ultrafialovým zářením, ve stratosféře', note: 'způsobily ho freony ze sprejů a chladniček' }],
    ['Q183481', 'změna klimatu', { where: 'Sahel, Střední Asie', feat: 'šíření pouště do sušších oblastí, často vinou člověka' }],
    // Mořské proudy
    ['Q130905', 'mořský proud', { temp: 'teplý', ocean: 'Atlantský', where: 'od Mexického zálivu k Evropě', feat: 'díky němu má západní Evropa mírné zimy' }],
    ['Q53842', 'mořský proud', { temp: 'teplý', ocean: 'Tichý', where: 'podél Japonska', feat: 'tichomořská obdoba Golfského proudu' }],
    ['Q47954', 'mořský proud', { temp: 'studený', ocean: 'Atlantský', where: 'podél východního pobřeží Kanady', feat: 'přináší ledovce na jih, i ten, do kterého narazil Titanic' }],
    ['Q59676', 'mořský proud', { temp: 'studený', ocean: 'Atlantský', where: 'podél jihozápadní Afriky', feat: 'kvůli němu je na pobřeží poušť Namib' }],
    ['Q143888', 'mořský proud', { temp: 'studený', ocean: 'Tichý', where: 'podél západního pobřeží Jižní Ameriky', feat: 'je bohatý na ryby a kvůli němu je na pobřeží poušť Atacama' }],
    ['Q213197', 'mořský proud', { temp: 'studený', ocean: 'Atlantský', where: 'podél severozápadní Afriky', feat: 'ochlazuje pobřeží Sahary a ostrovů u Maroka' }],
    ['Q677292', 'mořský proud', { temp: 'teplý', ocean: 'Atlantský', where: 'podél východního pobřeží Jižní Ameriky', feat: 'teče od rovníku na jih až k ústí La Platy' }],
    // Místní větry
    ['Q193742', 'místní vítr', { where: 'jižní Francie, údolí Rhôny', feat: 'studený suchý severní vítr, který přináší jasné počasí' }],
    ['Q190825', 'místní vítr', { where: 'chorvatské pobřeží Jadranu', feat: 'nárazový studený vítr padající z hor k moři' }],
    ['Q214152', 'místní vítr', { where: 'západní Afrika', feat: 'suchý prašný vítr ze Sahary v zimních měsících' }],
    ['Q475746', 'místní vítr', { where: 'Egypt a Blízký východ', feat: 'horký suchý vítr z pouště, který přináší písečné bouře' }],
    ['Q898845', 'místní vítr', { where: 'východní svahy Skalnatých hor', feat: 'teplý suchý vítr, který v zimě rychle rozpustí sníh' }],
    ['Q180372', 'místní vítr', { where: 'Jadran a Středomoří', feat: 'teplý vlhký jihovýchodní vítr, přináší déšť a vysoké vlny' }],
    ['Q453122', 'místní vítr', { where: 'Katalánsko, Baleáry a severní Itálie', feat: 'studený severní vítr z hor' }],
    ['Q81242', 'místní vítr', { where: 'mořská pobřeží a břehy jezer', feat: 'vítr, který přes den vane z vody na souš a v noci opačně' }]
];

// --- Počasí a oblaka (omezeně): [ID, druh, údaje] ---
// alt = patro oblaků, grp = druh jevu, rain = srážky, feat = vzhled nebo vznik (bez názvu), al = české nebo latinské jméno
const POCASI = [
    ['Q14189', 'oblak', { alt: 'nízké, s vertikálním vývojem', feat: 'bílé nadýchané obláčky s plochou spodní základnou', rain: 'za pěkného počasí žádné', al: ['Kupa', 'Kumulus'] }],
    ['Q182311', 'oblak', { alt: 'od nízkých výšek až k hranici stratosféry', feat: 'mohutná bouřková oblaka, nahoře rozšířená do tvaru kovadliny', rain: 'přeháňky, bouřky, kroupy', al: ['Kumulonimbus', 'Bouřkový oblak'] }],
    ['Q185638', 'oblak', { alt: 'vysoké (nad 6 km)', feat: 'jemná bílá vlákna z ledových krystalků', rain: 'žádné', al: ['Řasa', 'Cirus'] }],
    ['Q40526', 'oblak', { alt: 'nízké (do 2 km)', feat: 'šedá souvislá vrstva podobná zvednuté mlze', rain: 'mrholení', al: ['Sloha'] }],
    ['Q202411', 'oblak', { alt: 'střední (2–6 km)', feat: 'bílé nebo šedé chomáčky či valouny v řadách', rain: 'většinou žádné', al: ['Vyvýšená kupa', 'Altokumulus'] }],
    ['Q202145', 'oblak', { alt: 'střední (2–6 km)', feat: 'šedavá vrstva, přes kterou prosvítá slunce jako přes matné sklo', rain: 'slabý déšť nebo sníh', al: ['Vyvýšená sloha', 'Altostratus'] }],
    ['Q202278', 'oblak', { alt: 'nízké až střední', feat: 'tmavá šedá vrstva, která zakryje celé nebe', rain: 'vytrvalý déšť nebo sníh', al: ['Dešťová sloha', 'Nimbostratus'] }],
    ['Q201564', 'oblak', { alt: 'vysoké (nad 6 km)', feat: 'průsvitný bělavý závoj, kolem slunce vytváří halo', rain: 'žádné', al: ['Řasová sloha', 'Cirostratus'] }],
    ['Q40564', 'oblak', { alt: 'nízké (do 2 km)', feat: 'šedé nebo bělavé valouny a kotouče ve vrstvě', rain: 'nejvýš slabé', al: ['Slohová kupa', 'Stratokumulus'] }],
    ['Q40748', 'oblak', { alt: 'vysoké (nad 6 km)', feat: 'drobné bílé obláčky v řadách jako rybí šupiny', rain: 'žádné', al: ['Řasová kupa', 'Cirokumulus'] }],
    ['Q192794', 'oblak', { alt: 'mezosféra ve výšce asi 80 km', feat: 'modrostříbřitá oblaka zářící na tmavé letní obloze dlouho po západu slunce' }],
    ['Q216417', 'oblak', { alt: 'stratosféra ve výšce 15–25 km', feat: 'duhově zbarvená oblaka viditelná v polárních zimách za soumraku' }],
    ['Q741276', 'oblak', { alt: 'střední a vysoké', feat: 'hladká oblaka ve tvaru čočky nebo létajícího talíře nad horami' }],
    ['Q37477', 'jev počasí', { grp: 'zákal', feat: 'oblak u země, ve kterém je vidět méně než na kilometr', note: 'nejčastěji se tvoří za chladných bezvětrných nocí v údolích' }],
    ['Q2857578', 'jev počasí', { grp: 'silná konvekce', feat: 'blesky a hromy z mohutného kupovitého oblaku, často s lijákem', note: 'v Česku jich je nejvíc v červnu a červenci' }],
    ['Q8081', 'jev počasí', { grp: 'vzdušný vír', feat: 'rychle se otáčející vzdušný vír, který sahá od bouřkového oblaku až k zemi', note: 'nejvíc jich je na Velkých planinách USA' }],
    ['Q747894', 'jev počasí', { grp: 'silná konvekce', feat: 'mohutná bouřka s rotujícím výstupným proudem, z níž vznikají kroupy i tornáda' }],
    ['Q1022922', 'jev počasí', { grp: 'vzdušný vír', feat: 'vír nad mořem nebo jezerem, který nasává tříšť' }],
    ['Q182878', 'jev počasí', { grp: 'zvířený prach', feat: 'silný vítr v poušti zvedne zrnka do výšky a zakryje slunce' }],
    ['Q37602', 'jev počasí', { grp: 'srážky', feat: 'ledové kuličky z bouřkových oblaků, které rostou při opakovaném stoupání v oblaku' }],
    ['Q41097', 'jev počasí', { grp: 'usazenina na předmětech', feat: 'kapky vody, které se ráno srazí na trávě a předmětech z vlhkého vzduchu' }],
    ['Q4590598', 'jev počasí', { grp: 'usazenina na předmětech', feat: 'jemné ledové krystalky na větvích a trávě, které vznikají z vodní páry v mrazu' }],
    ['Q1192031', 'jev počasí', { grp: 'usazenina na předmětech', feat: 'průhledná kluzká vrstva na zemi i větvích, když prší na podchlazený povrch' }],
    ['Q186310', 'jev počasí', { grp: 'optický jev', feat: 'světelné kruhy a skvrny kolem Slunce nebo Měsíce od lomu světla v ledových krystalech' }],
    ['Q210659', 'jev počasí', { grp: 'optický jev', feat: 'přelud: obraz vzdálených předmětů nebo vody nad rozpáleným povrchem' }],
    ['Q550147', 'jev počasí', { grp: 'srážky', feat: 'krystal ledu se šesti cípy, žádné dva nejsou stejné' }]
];

// Druhy podle kategorie (štítek nad otázkou) a otázky na název podle druhu
export const KIND_QUESTIONS = {
    katastrofy: {
        'zemětřesení': 'Které zemětřesení to bylo?', 'tsunami': 'Která katastrofa to byla?', 'sopka': 'Která sopka to je?', 'hurikán': 'Který hurikán to byl?',
        'tajfun': 'Který tajfun to byl?', 'cyklón': 'Která tropická cyklóna to byla?', 'povodeň': 'Která povodeň to byla?', 'bouře': 'Která katastrofa to byla?',
        'tornádo': 'Která katastrofa to byla?', 'vlna veder': 'Která katastrofa to byla?', 'požár': 'Která katastrofa to byla?', 'sucho': 'Která katastrofa to byla?',
        'stupnice': 'Která stupnice to je?'
    },
    klima: {
        'podnebný pás': 'Který podnebný pás to je?', 'typ podnebí': 'Jaký typ podnebí to je?', 'biom': 'Jaký biom to je?', 'klimatický jev': 'Jaký jev to je?',
        'změna klimatu': 'Co je to?', 'mořský proud': 'Který mořský proud to je?', 'místní vítr': 'Který vítr to je?'
    },
    pocasi: { 'oblak': 'Jaký druh oblaku to je?', 'jev počasí': 'Jaký jev to je?' }
};

// Názvy, kde je štítek Wikidat nevhodný (rozcestník, malé písmeno) nebo článek nese upřesnění
const NAMES = { Q42530: 'Tropický pás', Q193372: 'Polární pás', Q60042839: 'Tsunami v Sundském průlivu (2018)', Q2071883: 'Santorin',
    Q15136651: 'Tajfun Haiyan', Q107529288: 'Povodně v západní Evropě (2021)', Q130214931: 'Tajfun Yagi', Q37602: 'Kroupy', Q186310: 'Halové jevy', Q898845: 'Chinook', Q81242: 'Bríza' };
// Jiná jména, která hra uzná jako správnou odpověď
const ALIASES = { Q36204: ['Zemětřesení v Tóhoku', 'Tóhoku'], Q274498: ['Zemětřesení v Kantó'], Q82613: ['Krakatau'], Q3143318: ['Hunga Tonga'],
    Q650836: ['Yellowstone'], Q193372: ['Polární podnebí'], Q5967371: ['Subarktické podnebí'], Q190946: ['Pouštní podnebí'],
    Q124196: ['Stepní podnebí'], Q209531: ['Rovníkové podnebí'], Q113562: ['Savanové podnebí'], Q863882: ['Monzunové podnebí'],
    Q182090: ['Oceánské podnebí'], Q8514: ['Pouště'], Q7942: ['Globální změna klimatu', 'Oteplování'], Q49367: ['Ledová doba'], Q143888: ['Humboldtův proud'], Q193742: ['Mistral'], Q214152: ['Harmattan'], Q475746: ['Chamsín'],
    Q38768: ['Richterova škála'], Q170350: ['Mercalliho škála'], Q205801: ['Saffirova-Simpsonova stupnice'], Q380770: ['Fujitova škála'] };
// Položky, které se jako možnosti jedné otázky překrývají (Doba ledová – Glaciál)
const CONFLICTS = [['Q49367', 'Q602963'], ['Q7939', 'Q642867'], ['Q43262', 'Q2492828'], ['Q123991', 'Q840819'], ['Q123991', 'Q194281'], ['Q123991', 'Q184382'],
    ['Q8514', 'Q190946'], ['Q124196', 'Q123991'], ['Q42530', 'Q209531'], ['Q193372', 'Q5985406'], ['Q1342399', 'Q5967371'], ['Q69564', 'Q5967371'],
    ['Q185005', 'Q589326'], ['Q42320', 'Q113562'], ['Q199403', 'Q209531'], ['Q144012', 'Q13996'], ['Q130905', 'Q53842'], ['Q3117517', 'Q42967'],
    ['Q130297776', 'Q86929'], ['Q201564', 'Q186310'], ['Q203726', 'Q39651'], ['Q60042839', 'Q55974069']];
// Fotka, která otázku neukazuje (mapa, graf, schéma, nápis s názvem): u položky se nepoužije
const NO_IMAGE = new Set(['Q189079', 'Q56768333', 'Q136033573', 'Q186291', 'Q3005548', 'Q1136557', 'Q42530', 'Q130905', 'Q1137345', 'Q338589', 'Q753858', 'Q211446',
    'Q183140', 'Q7942', 'Q202325', 'Q215712']);
// Nikdy známé: odborné pojmy a jevy, které zná jen málokdo, i když mají hodně jazykových verzí
// a nedávné nebo vzdálené katastrofy, které česká Wikipedie čte jen krátce po nich (Tibet a Kamčatka 2025)
const NEVER_KNOWN = new Set(['Q1137345', 'Q338589', 'Q753858', 'Q211446', 'Q602963', 'Q304575', 'Q840819', 'Q2492828', 'Q1735004', 'Q5985406',
    'Q216417', 'Q741276', 'Q186310', 'Q131692964', 'Q135502884', 'Q186291', 'Q726501', 'Q203726', 'Q367449', 'Q23825118']);
// Známé vždy: školní učivo zeměpisu (podnebné pásy, monzun, pasát, Golfský proud, základní druhy oblaků) a katastrofy, o kterých se
// v Česku hodně mluvilo (Tóhoku 2011, Krakatoa, Eyjafjallajökull, povodně 1997 a 2002, tornádo na Moravě)
const ALWAYS_KNOWN = new Set(['Q36204', 'Q116691303', 'Q274498', 'Q82613', 'Q39651', 'Q650836', 'Q2071883', 'Q38685186', 'Q15136651', 'Q152314',
    'Q107339234', 'Q315494', 'Q86929', 'Q38768', 'Q170464', 'Q42530', 'Q10374615', 'Q167466', 'Q193372', 'Q13996', 'Q185005', 'Q7939', 'Q42967',
    'Q160603', 'Q130905', 'Q190825', 'Q7942', 'Q49367', 'Q190530', 'Q183140', 'Q14189', 'Q182311', 'Q185638', 'Q40526', 'Q8081',
    'Q2857578', 'Q37477', 'Q37602', 'Q210659', 'Q41097', 'Q199403']);

// Okruhy rozšíření (na konci seznamu okruhů)
const isCyclone = (item) => ['hurikán', 'tajfun', 'cyklón'].includes(item.ty);
const WEATHER_DISASTERS = ['povodeň', 'bouře', 'tornádo', 'vlna veder', 'požár', 'sucho'];
export const EXTRA_COLLECTIONS = [
    { id: 'zemetreseni', label: 'Zemětřesení a tsunami', text: 'Tóhoku 2011, Turecko 2023, Kantó 1923…', sort: { by: 'year' }, test: item => item.c === 'katastrofy' && ['zemětřesení', 'tsunami'].includes(item.ty) },
    { id: 'sopky-erupce', label: 'Sopky a jejich erupce', text: 'Krakatoa, Eyjafjallajökull, Laki…', sort: { by: 'year' }, test: item => item.c === 'katastrofy' && item.ty === 'sopka' },
    { id: 'hurikany-tajfuny', label: 'Hurikány a tajfuny', text: 'Irma, Haiyan, Nargis…', sort: { by: 'year' }, test: item => item.c === 'katastrofy' && isCyclone(item) },
    { id: 'povodne-bure', label: 'Povodně, bouře a vedra', text: 'Povodně 1997 a 2002, Kyrill, tornádo na Moravě…', sort: { by: 'year' }, test: item => item.c === 'katastrofy' && WEATHER_DISASTERS.includes(item.ty) },
    { id: 'stupnice-sily', label: 'Stupnice síly', text: 'Richterova, Beaufortova, Saffirova–Simpsonova…', test: item => item.c === 'katastrofy' && item.ty === 'stupnice' },
    { id: 'ceske-katastrofy', label: 'Katastrofy v Česku', text: 'Povodně, orkán Kyrill, tornádo na Hodonínsku', sort: { by: 'year' }, test: item => item.c === 'katastrofy' && item.cz === 1 },
    { id: 'podnebne-pasy', label: 'Podnebné pásy a typy podnebí', text: 'Tropický pás, středomořské, kontinentální…', test: item => item.c === 'klima' && ['podnebný pás', 'typ podnebí'].includes(item.ty) },
    { id: 'biomy', label: 'Biomy', text: 'Tundra, tajga, savana, step, prérie…', test: item => item.c === 'klima' && item.ty === 'biom' },
    { id: 'klimaticke-jevy', label: 'Klimatické jevy a větry', text: 'Monzun, El Niño, pasát, mistrál, bóra…', test: item => item.c === 'klima' && ['klimatický jev', 'místní vítr'].includes(item.ty) },
    { id: 'zmeny-klimatu', label: 'Změny klimatu', text: 'Doba ledová, malá doba ledová, globální oteplování…', test: item => item.c === 'klima' && item.ty === 'změna klimatu' },
    { id: 'morske-proudy', label: 'Mořské proudy', text: 'Golfský proud, Kurošio, Labradorský proud…', test: item => item.c === 'klima' && item.ty === 'mořský proud' },
    { id: 'oblaka', label: 'Druhy oblaků', text: 'Cumulus, cirrus, cumulonimbus…', test: item => item.c === 'pocasi' && item.ty === 'oblak' },
    { id: 'jevy-pocasi', label: 'Jevy počasí', text: 'Bouřka, tornádo, kroupy, jinovatka…', test: item => item.c === 'pocasi' && item.ty === 'jev počasí' }
].map(collection => ({ sort: { by: 'name' }, ...collection }));

// --- Wikidata ---
const ENTRIES = [...KATASTROFY.map(entry => ['katastrofy', ...entry]), ...KLIMA.map(entry => ['klima', ...entry]), ...POCASI.map(entry => ['pocasi', ...entry])];
const ALL_IDS = ENTRIES.map(([, q]) => q);
export const EXTRA_IDS = new Set(ALL_IDS);
const SINGLE = { t: 1, n: 1, d: 1, im: 1, sl: 1, pt: 1 };
const fetchDetails = () => cached(`geologie-rozsireni-details-${ALL_IDS.length}`, async () => {
    const result = new Map(ALL_IDS.map(qid => [qid, {}]));
    await inBatches(ALL_IDS, 80, (qids) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("pt" AS ?p) } }`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        if (SINGLE[key] && !(key in entry)) entry[key] = key === 'sl' ? Number(row.v.value) : row.v.value;
    }, qlever);
    return [...result];
});

// Q-id všech položek jiných témat (stejná položka nemá být ve dvou tématech)
const otherTopicIds = () => {
    const ids = new Map();
    const dir = new URL('../../data/', import.meta.url);
    const topics = readdirSync(new URL('../../topics/', import.meta.url)).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
    for (const topic of topics) {
        if (topic === 'geologie') continue;
        let data;
        try { data = JSON.parse(readFileSync(new URL(`${topic}.json`, dir), 'utf8')); } catch { continue; }
        for (const item of data.items || []) if (item.q) ids.set(item.q, topic);
    }
    return ids;
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const fileOf = (url) => url ? decodeURIComponent(url.split('/Special:FilePath/').pop()) : '';
// Poloha z Wikidat „Point(lon lat)“ → [lat, lon] na dvě desetinná místa
const pointOf = (wkt) => {
    const match = /Point\(([-\d.]+) ([-\d.]+)\)/i.exec(wkt || '');
    return match ? [Math.round(Number(match[2]) * 100) / 100, Math.round(Number(match[1]) * 100) / 100] : undefined;
};
const conflictsOf = (qid, nameOf) => CONFLICTS.filter(pair => pair.includes(qid)).map(pair => nameOf(pair[0] === qid ? pair[1] : pair[0])).filter(Boolean);

// Sestaví nové položky (bez úrovní) nad dosavadními položkami tématu: vynechá ID a názvy, které téma už má, a položky jiných témat
export const buildExtra = async ({ existing }) => {
    const details = new Map(await fetchDetails());
    const other = otherTopicIds();
    const base = existing.filter(item => !EXTRA_IDS.has(item.q) || !isExtraItem(item));
    const haveIds = new Set(base.map(item => item.q));
    const names = new Set(base.map(item => item.n.toLowerCase()));
    const skipped = { other: [], have: [], missing: [], name: [] };
    const nameOf = (qid) => {
        const detail = details.get(qid) || {};
        return NAMES[qid] || (detail.t ? capitalize(detail.t) : '');
    };
    const items = [];
    for (const [category, qid, ty, extra] of ENTRIES) {
        const detail = details.get(qid) || {};
        if (other.has(qid)) { skipped.other.push(`${detail.t || qid} (${other.get(qid)})`); continue; }
        if (haveIds.has(qid)) { skipped.have.push(detail.t || qid); continue; }
        if (!detail.t) { skipped.missing.push(qid); continue; }
        const n = nameOf(qid);
        if (names.has(n.toLowerCase())) { skipped.name.push(n); continue; }
        names.add(n.toLowerCase());
        haveIds.add(qid);
        const photo = !NO_IMAGE.has(qid) && isRealPhoto(fileOf(detail.im)) ? imageFields(detail.im) : {};
        // Oblak a jev počasí se poznávají z fotky v otázce: bez skutečné fotky se vynechají
        if (category === 'pocasi' && !photo.im) { skipped.missing.push(`${detail.t} (bez fotky)`); continue; }
        const { cz, ...facts } = extra;
        const f = compact({ ...facts, pt: category === 'katastrofy' && ty !== 'stupnice' ? pointOf(detail.pt) : undefined, al: ALIASES[qid], cf: conflictsOf(qid, nameOf) });
        items.push(compact({ q: qid, t: detail.t, n, c: category, k: 0, ty, d: detail.d && !/rozcestník/.test(detail.d) ? detail.d : undefined, cz, ...photo, f,
            _: { sl: detail.sl || 0, title: detail.t } }));
    }
    return { items, skipped };
};

// Položka rozšíření z dřívějšího běhu: nové sestavení ji nahradí (stejné id)
export const isExtraItem = (item) => EXTRA_CATEGORIES.includes(item.c);

// --- Úrovně (stejný postup jako u ostatních kategorií Geologie, lib/fame-levels.mjs) ---
// Známé: vybrané (ALWAYS_KNOWN) a doplnění na nejznámějších ~30 % kategorie (stupnice a česká stopa zvlášť), spodní hranice okruhu jen z lepší poloviny skupiny,
// pro experty nejméně známých 27 % (česká stopa 15 %)
const KNOWN_SHARE = 0.3;
// Katastrofy po skupinách (sopky mají mnohem víc jazykových verzí než zemětřesení), česká stopa zvlášť
const DISASTER_POOLS = { 'zemětřesení': 'zeme', 'tsunami': 'zeme', 'sopka': 'sopky', 'hurikán': 'cyklony', 'tajfun': 'cyklony', 'cyklón': 'cyklony', 'stupnice': 'stupnice' };
const poolOf = (item) => item.cz ? `${item.c}:cz` : item.c === 'katastrofy' ? `katastrofy:${DISASTER_POOLS[item.ty] || 'pocasi'}` : item.c;
export const extraLevels = async (fresh) => {
    const pageviews = await topicPageviews('geologie-rozsireni-pageviews', fresh.map(item => item._.title), { offline: process.env.PAGEVIEWS_OFFLINE === '1' });
    for (const item of fresh) {
        Object.assign(item._, { pv: pageviews[item._.title], pool: poolOf(item), never: NEVER_KNOWN.has(item.q), protect: ALWAYS_KNOWN.has(item.q) });
        item.k = ALWAYS_KNOWN.has(item.q) ? 1 : 0;
    }
    const groups = [...EXTRA_COLLECTIONS.map(collection => ({ id: collection.id, members: fresh.filter(item => collection.test(item)) })),
        ...EXTRA_CATEGORIES.map(category => ({ id: `c:${category}`, members: fresh.filter(item => item.c === category) }))].filter(group => group.members.length);
    return assignLevels(fresh, {
        knownShare: (pool) => pool.endsWith(':cz') ? 0.5 : KNOWN_SHARE,
        expertShare: (pool) => pool.endsWith(':cz') ? 0.15 : 0.27,
        ceiling: () => 0.5,
        groups
    });
};

// Sloučí rozšíření do dat tématu: dosavadní položky beze změny, nové položky na konec, okruhy na konec seznamu.
// Položky rozšíření z dřívějšího běhu nahradí nové sestavení (stejné id); ty, které nový běh nenašel, zůstanou (žádné id nezmizí)
export const mergeExtra = async ({ collections, items }, extra) => {
    const fresh = extra.items;
    const freshIds = new Set(fresh.map(item => item.q));
    const kept = items.filter(item => !(isExtraItem(item) && freshIds.has(item.q)));
    const promoted = await extraLevels(fresh);
    for (const item of fresh) {
        const groups = EXTRA_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
        if (groups.length) item.g = groups;
        delete item._;
    }
    const stale = items.filter(item => isExtraItem(item) && !freshIds.has(item.q));
    if (stale.length) console.warn(`  rozšíření: ${stale.length} dřívějších položek nový běh nenašel, zůstávají (${stale.slice(0, 5).map(item => item.n).join(', ')}…)`);
    const ids = new Set(EXTRA_COLLECTIONS.map(collection => collection.id));
    return {
        collections: [...collections.filter(collection => !ids.has(collection.id)), ...EXTRA_COLLECTIONS.map(({ test, ...collection }) => collection)],
        items: [...kept, ...fresh],
        promoted
    };
};

// Přehled pro výpis: počty a úrovně v nových kategoriích a okruzích, vynechané položky
export const extraSummary = (items, skipped) => {
    for (const category of EXTRA_CATEGORIES) {
        const list = items.filter(item => item.c === category);
        console.log(`${category}: ${list.length} (známých ${list.filter(item => item.k === 1).length}, expert ${list.filter(item => item.x).length}, s fotkou ${list.filter(item => item.im).length})`);
    }
    for (const collection of EXTRA_COLLECTIONS) {
        const members = items.filter(item => (item.g || []).includes(collection.id));
        const knownCount = members.filter(item => item.k === 1).length;
        const expert = members.filter(item => item.x).length;
        console.log(`  okruh ${collection.id}: ${members.length} (známých ${knownCount}, expert ${expert})${knownCount < knownFloor(members.length) ? ' – POD SPODNÍ HRANICÍ' : ''}${expert > members.length * EXPERT_MAX_SHARE ? ' – MOC EXPERTŮ' : ''}`);
    }
    if (skipped) {
        if (skipped.other.length) console.log(`  vynecháno, už je v jiném tématu: ${skipped.other.join(', ')}`);
        if (skipped.have.length) console.log(`  vynecháno, Geologie už má: ${skipped.have.join(', ')}`);
        if (skipped.missing.length) console.log(`  vynecháno, chybí článek: ${skipped.missing.join(', ')}`);
        if (skipped.name.length) console.log(`  vynecháno, název už téma má: ${skipped.name.join(', ')}`);
    }
};
