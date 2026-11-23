// Chemie: kategorie „Materiály a suroviny“ (materialy) – slitiny, plasty, sklo a keramika, stavební hmoty, paliva, papír a vlákna,
// barvy a lepidla, výbušniny. Položky jsou ručně vybrané podle ID ve Wikidatech (s českým článkem); název, článek, popis a fotka
// jsou z Wikidat, fakta (složení, využití, výroba, vznik, vynálezce, hustota) jsou ručně psaná, protože Wikidata je u materiálů
// mají jen místy a často chybně (ocel „objevena 1865“, hustota PET 1,38 kg/m³).
// Nerosty a horniny (uhlí, kaolin, jíl, písek, mramor) patří Geologii, chemické sloučeniny se vzorcem kategorii Sloučeniny a látky.
//
// Položky, které už v datech byly v kategorii Pojmy a metody (ocel, sklo, beton, PVC…), se sem přesunou se stejným ID a stejnou
// úrovní (k, x) a s dosavadními okruhy (Slitiny, směsi a materiály) – okruh kategorie se jim jen přidá.
//
// Záznam: [ID, okruh, úroveň, fakta]
//   úroveň: 1 = Základní (zná ji většina lidí), 2 = Mudrlant, 3 = jen pro experty (Mudrlant Expert)
//   fakta: s = složení, v = využití, vy = výroba / původ, year = vznik (vynález), by = vynálezce (bf: 1 = vynálezkyně),
//          dens = hustota v g/cm³, n = český název (místo názvu z Wikidat), al = další názvy (platí jako odpověď a zakryjí se v popisu),
//          im = jiná fotka (materialImage)
// Hodnoty faktů nesmějí prozradit název (Mědinikl: „měď, nikl“ nápovědy samy vynechají, factRevealsAnswer) a nemají obsahovat
// čárky uvnitř jedné položky výčtu (čárka odděluje položky: indicie Tajemné otázky).

export const MATERIAL_COLLECTIONS = [
    { id: 'kovy-slitiny', label: 'Kovy a slitiny', text: 'Ocel, bronz, mosaz, dural…', sort: { by: 'name' } },
    { id: 'plasty-pryz', label: 'Plasty a pryž', text: 'PVC, polyethylen, teflon, kaučuk…', sort: { by: 'name' } },
    { id: 'kompozity', label: 'Kompozity a moderní materiály', text: 'Kevlar, uhlíkové vlákno, grafen…', sort: { by: 'name' } },
    { id: 'sklo-keramika', label: 'Sklo a keramika', text: 'Porcelán, kamenina, terakota, smalt…', sort: { by: 'name' } },
    { id: 'stavebni-hmoty', label: 'Stavební hmoty', text: 'Beton, cement, malta, cihla…', sort: { by: 'name' } },
    { id: 'paliva', label: 'Paliva a ropné produkty', text: 'Benzín, nafta, LPG, koks…', sort: { by: 'name' } },
    { id: 'papir-vlakna', label: 'Papír, dřevo a vlákna', text: 'Papír, pergamen, korek, bavlna…', sort: { by: 'name' } },
    { id: 'barvy-lepidla', label: 'Barvy, laky a lepidla', text: 'Inkoust, lak, pryskyřice, vosk…', sort: { by: 'name' } },
    { id: 'vybusniny', label: 'Výbušniny a zápalné směsi', text: 'Střelný prach, dynamit, semtex…', sort: { by: 'name' } },
    { id: 'cistidla-hnojiva', label: 'Čisticí prostředky a hnojiva', text: 'Mýdlo, prací prostředek, kompost…', sort: { by: 'name' } }
];

export const MATERIALS = [
    // --- Kovy a slitiny ---
    ['Q11427', 'kovy-slitiny', 1, { s: 'železo, uhlík', v: 'stavby, mosty, nástroje, automobily', vy: 'zkujňování surového železa', dens: 7.85 }], // ocel
    ['Q483269', 'kovy-slitiny', 1, { s: 'železo, uhlík, křemík', v: 'kamna, radiátory, kanálové poklopy, pánve', dens: 7.2 }], // litina
    ['Q1055770', 'kovy-slitiny', 3, { s: 'železo, uhlík v podobě grafitu', v: 'bloky motorů, kanálové poklopy' }], // šedá litina
    ['Q901785', 'kovy-slitiny', 2, { s: 'železo, uhlík, křemík, mangan', v: 'výroba oceli a litiny', vy: 'tavení železné rudy ve vysoké peci' }], // surové železo
    ['Q172587', 'kovy-slitiny', 1, { s: 'železo, chrom, nikl', v: 'příbory, nádobí, dřezy, chirurgické nástroje', year: 1913, by: 'Harry Brearley', dens: 7.9, al: ['Nerezová ocel', 'Nerez'] }], // korozivzdorná ocel
    ['Q475736', 'kovy-slitiny', 2, { s: 'železo, uhlík', v: 'čepele mečů a nožů s vlnitou kresbou' }], // damascénská ocel
    ['Q1127242', 'kovy-slitiny', 3, { s: 'železo, wolfram, molybden, chrom, vanad', v: 'vrtáky, frézy, soustružnické nože' }], // rychlořezná ocel
    ['Q1024124', 'kovy-slitiny', 2, { s: 'železo, měď, chrom, nikl', v: 'fasády, mosty, venkovní sochy', al: ['Corten'] }], // povětrnostně odolná ocel
    ['Q34095', 'kovy-slitiny', 1, { s: 'měď, cín', v: 'sochy, zvony, medaile', dens: 8.8 }], // bronz
    ['Q1660564', 'kovy-slitiny', 3, { s: 'měď, asi pětina cínu', v: 'odlévání zvonů' }], // zvonovina
    ['Q39782', 'kovy-slitiny', 1, { s: 'měď, zinek', v: 'kliky, vodovodní baterie, dechové nástroje, nábojnice', dens: 8.5 }], // mosaz
    ['Q756257', 'kovy-slitiny', 2, { s: 'přes 80 % mědi, zinek', v: 'odznaky, bižuterie, medaile' }], // tombak
    ['Q243558', 'kovy-slitiny', 2, { s: 'hliník, měď, hořčík', v: 'letadla, jízdní kola, žebříky', by: 'Alfred Wilm', dens: 2.8 }], // dural
    ['Q203874', 'kovy-slitiny', 2, { s: 'měď, nikl, zinek', v: 'příbory, mince, klíče', al: ['Pakfong', 'Nové stříbro'] }], // alpaka
    ['Q649090', 'kovy-slitiny', 3, { s: 'měď, nikl', v: 'mince' }], // mědinikl
    ['Q1072385', 'kovy-slitiny', 3, { s: 'nikl, chrom', v: 'topné spirály, odporové dráty' }], // nichrom
    ['Q900175', 'kovy-slitiny', 3, { s: 'nikl, měď', v: 'lodní šrouby, chemická zařízení' }], // monel
    ['Q898429', 'kovy-slitiny', 3, { s: 'měď, nikl, mangan', v: 'odporové dráty, termočlánky', im: '' }], // konstantan
    ['Q898215', 'kovy-slitiny', 3, { s: 'železo, nikl', v: 'přesné hodiny, měřidla', year: 1896, by: 'Charles Édouard Guillaume' }], // invar
    ['Q905989', 'kovy-slitiny', 3, { s: 'bismut, olovo, cín, kadmium', v: 'tavné pojistky, sprinklery' }], // Woodův kov
    ['Q899309', 'kovy-slitiny', 3, { s: 'železo, křemík', v: 'výroba oceli' }], // ferosilicium
    ['Q239481', 'kovy-slitiny', 2, { s: 'zlato, stříbro', v: 'nejstarší mince' }], // elektrum
    ['Q866612', 'kovy-slitiny', 2, { s: 'cín s olovem nebo se stříbrem a mědí', v: 'pájení elektroniky a potrubí' }], // pájka
    ['Q182574', 'kovy-slitiny', 1, { s: 'rtuť, další kov', v: 'zubní výplně, získávání zlata' }], // amalgám
    ['Q37756', 'kovy-slitiny', 1, { s: 'kov smíchaný s dalšími kovy nebo prvky' }], // slitina
    ['Q447349', 'kovy-slitiny', 1, { s: 'hliník', v: 'balení potravin, pečení' }], // alobal

    // --- Plasty a pryž ---
    ['Q11474', 'plasty-pryz', 1, { s: 'polymery a přísady', v: 'obaly, hračky, nádobí, součástky', vy: 'hlavně z ropy' }], // plast
    ['Q143429', 'plasty-pryz', 1, { v: 'sáčky, fólie, lahve, potrubí', year: 1933, dens: 0.94, al: ['Mikroten'] }], // polyethylen
    ['Q146174', 'plasty-pryz', 2, { v: 'kelímky, krabičky, potrubí, koberce', year: 1954, by: 'Giulio Natta', dens: 0.9 }], // polypropylen
    ['Q146368', 'plasty-pryz', 1, { v: 'trubky, okna, podlahové krytiny, kabely', dens: 1.39, al: ['PVC'] }], // polyvinylchlorid
    ['Q146243', 'plasty-pryz', 1, { v: 'obaly, kelímky, tepelné izolace', dens: 1.05 }], // polystyren
    ['Q145863', 'plasty-pryz', 1, { n: 'PET', v: 'lahve na nápoje, textilní vlákna', year: 1941, dens: 1.38, al: ['Polyethylentereftalát'] }], // polyethylentereftalát
    ['Q143252', 'plasty-pryz', 1, { n: 'Teflon', v: 'nepřilnavé pánve, těsnění, izolace kabelů', year: 1938, by: 'Roy Plunkett', dens: 2.2, al: ['Polytetrafluorethylen', 'PTFE'] }], // polytetrafluorethylen
    ['Q146123', 'plasty-pryz', 1, { n: 'Plexisklo', v: 'průhledné desky, akvária, světelné reklamy', year: 1933, by: 'Otto Röhm', dens: 1.18, al: ['Polymethylmethakrylát', 'PMMA', 'Organické sklo'] }], // polymethylmethakrylát
    ['Q62246', 'plasty-pryz', 2, { v: 'střešní desky, brýlové čočky, kompaktní disky', year: 1953, dens: 1.2 }], // polykarbonát
    ['Q146322', 'plasty-pryz', 2, { v: 'molitan, pěny, laky, podrážky bot', year: 1937, by: 'Otto Bayer', al: ['PUR'], im: 'Urethane sponge1.jpg' }], // polyuretan
    ['Q177941', 'plasty-pryz', 1, { v: 'punčochy, lana, padáky, kartáčky', year: 1935, by: 'Wallace Carothers', dens: 1.14 }], // nylon
    ['Q188245', 'plasty-pryz', 1, { s: 'dikarboxylové kyseliny a dioly', v: 'textilní vlákna, lahve, laminátové lodě' }], // polyestery
    ['Q143496', 'plasty-pryz', 3, { v: 'kostičky stavebnic, kryty spotřebičů', dens: 1.05, al: ['ABS'] }], // akrylonitrilbutadienstyren
    ['Q146139', 'plasty-pryz', 3, { v: 'ozubená kolečka, zipy, spony', dens: 1.41, al: ['POM'] }], // polyoxymethylen
    ['Q146578', 'plasty-pryz', 2, { s: 'fenol, formaldehyd', v: 'vypínače, staré telefony a rádia', year: 1907, by: 'Leo Baekeland' }], // bakelit
    ['Q146612', 'plasty-pryz', 2, { s: 'nitrocelulóza, kafr', v: 'filmové pásy, pingpongové míčky, hřebeny' }], // celuloid
    ['Q193841', 'plasty-pryz', 1, { s: 'regenerovaná celulóza', v: 'obaly na bonbony a květiny', year: 1908, by: 'Jacques Brandenberger' }], // celofán
    ['Q143983', 'plasty-pryz', 2, { s: 'pryskyřice s tvrdidlem', v: 'lepidla, laminát, lité podlahy, šperky' }], // epoxidová pryskyřice
    ['Q146439', 'plasty-pryz', 1, { s: 'řetězce křemíku a kyslíku', v: 'těsnicí tmely, formy na pečení, implantáty' }], // silikon
    ['Q18113858', 'plasty-pryz', 1, { s: 'polyisopren', v: 'pneumatiky, gumy, těsnění', vy: 'z mízy kaučukovníku nebo synteticky' }], // kaučuk
    ['Q244680', 'plasty-pryz', 1, { v: 'rukavice, balónky, matrace', vy: 'z mléčné šťávy kaučukovníku' }], // latex
    ['Q461714', 'plasty-pryz', 3, { s: 'kaučuk, hodně síry', v: 'izolátory, plnicí pera, náustky dýmek' }], // ebonit

    // --- Kompozity a moderní materiály ---
    ['Q207344', 'kompozity', 1, { s: 'aramidová vlákna', v: 'neprůstřelné vesty, přilby, lana', year: 1965, by: 'Stephanie Kwolek', bf: 1, dens: 1.44, im: '' }], // kevlar
    ['Q5860', 'kompozity', 1, { s: 'uhlík', v: 'rámy kol, závodní auta, letadla, rakety', al: ['Uhlíková vlákna', 'Karbon'] }], // uhlíkové vlákno
    ['Q7224880', 'kompozity', 1, { s: 'skleněná vlákna, pryskyřice', v: 'lodě, bazény, karoserie, přilby', al: ['Laminát'] }], // sklolaminát
    ['Q181790', 'kompozity', 2, { s: 'dva nebo více různých materiálů', v: 'letadla, lodě, sportovní potřeby', al: ['Kompozit'] }], // kompozitní materiál
    ['Q162', 'kompozity', 1, { s: 'velmi čisté sklo nebo plast', v: 'internet, telekomunikace, endoskopy' }], // optické vlákno
    ['Q169917', 'kompozity', 2, { s: 'uhlík v jedné vrstvě atomů', v: 'elektronika, baterie, výzkum', year: 2004 }], // grafen
    ['Q381490', 'kompozity', 2, { s: 'hlavně vzduch v síti oxidu křemičitého', v: 'tepelné izolace, kosmické sondy', year: 1931, by: 'Samuel Stephens Kistler' }], // aerogel
    ['Q900548', 'kompozity', 3, { s: 'kov s bublinami plynu', v: 'lehké nárazníky, tlumiče, izolace' }], // kovová pěna
    ['Q413458', 'kompozity', 2, { s: 'škrob, celulóza nebo kyselina mléčná', v: 'kompostovatelné obaly a sáčky' }], // bioplast

    // --- Sklo a keramika ---
    ['Q11469', 'sklo-keramika', 1, { s: 'křemičitý písek, soda, vápenec', v: 'okna, lahve, sklenice', vy: 'tavení a rychlé ochlazení', dens: 2.5 }], // sklo
    ['Q392551', 'sklo-keramika', 1, { s: 'písek, potaš, často oxid olovnatý', v: 'broušené vázy, sklenice, lustry' }], // křišťálové sklo
    ['Q1142019', 'sklo-keramika', 2, { v: 'boční okna aut, sprchové kouty, skleněné dveře', vy: 'prudké ochlazení rozehřátého skla' }], // tvrzené sklo
    ['Q2122463', 'sklo-keramika', 3, { s: 'čistý oxid křemičitý', v: 'laboratorní nádobí, výbojky, optika' }], // křemenné sklo
    ['Q221163', 'sklo-keramika', 2, { s: 'sklo s trochou oxidu uranu', v: 'ozdobné sklo zářící v ultrafialovém světle', al: ['Anenské sklo'] }], // uranové sklo
    ['Q45621', 'sklo-keramika', 1, { s: 'jíl, kaolin, křemen, živec', v: 'nádobí, obklady, umyvadla', vy: 'vypalování za vysoké teploty' }], // keramika
    ['Q130693', 'sklo-keramika', 1, { s: 'kaolin, křemen, živec', v: 'nádobí, sošky, izolátory', vy: 'pálení při 1 300–1 450 °C' }], // porcelán
    ['Q830894', 'sklo-keramika', 2, { s: 'jíl', v: 'dlaždice, kanalizační roury, nádobí', vy: 'pálení až do slinutí střepu' }], // kamenina
    ['Q1377111', 'sklo-keramika', 3, { n: 'Pórovina', s: 'pálená hlína', v: 'hrnky, talíře, obklady' }], // pórovina
    ['Q60424', 'sklo-keramika', 1, { s: 'pálená hlína', v: 'květináče, střešní tašky, sochy' }], // terakota
    ['Q209671', 'sklo-keramika', 2, { s: 'pálená hlína, bílá cínová glazura', v: 'malované nádobí, kachle' }], // fajáns
    ['Q1455223', 'sklo-keramika', 3, { s: 'pálený jíl', v: 'vyzdívky pecí, krbů a kamen' }], // šamot
    ['Q335404', 'sklo-keramika', 2, { s: 'sklovitá vrstva', v: 'povrch keramiky a porcelánu' }], // glazura
    ['Q213371', 'sklo-keramika', 1, { s: 'sklovitá hmota', v: 'hrnce, vany, šperky' }], // smalt

    // --- Stavební hmoty ---
    ['Q22657', 'stavebni-hmoty', 1, { s: 'cement, voda, písek, štěrk', v: 'stavby, mosty, přehrady', dens: 2.4 }], // beton
    ['Q184190', 'stavebni-hmoty', 1, { s: 'beton, ocelová výztuž', v: 'stropy, mosty, mrakodrapy', year: 1867, by: 'Joseph Monier' }], // železobeton
    ['Q465444', 'stavebni-hmoty', 2, { v: 'mosty, nosníky, železniční pražce', by: 'Eugène Freyssinet' }], // předpjatý beton
    ['Q45190', 'stavebni-hmoty', 1, { s: 'pálený vápenec, jíl', v: 'beton, malta', vy: 'pálení a mletí slínku' }], // cement
    ['Q189566', 'stavebni-hmoty', 1, { s: 'písek, vápno nebo cement, voda', v: 'zdění a omítání' }], // malta
    ['Q274988', 'stavebni-hmoty', 1, { s: 'písek, vápno, cement', v: 'povrch zdí a stropů' }], // omítka
    ['Q33526', 'stavebni-hmoty', 2, { s: 'sádra, vápno, písek', v: 'ozdoby stropů a fasád' }], // štuk
    ['Q811360', 'stavebni-hmoty', 3, { s: 'síran vápenatý', v: 'omítky, odlitky, fixace zlomenin' }], // sádra
    ['Q372852', 'stavebni-hmoty', 1, { s: 'sádra mezi dvěma vrstvami kartonu', v: 'příčky, podhledy, obklady stěn' }], // sádrokarton
    ['Q1334655', 'stavebni-hmoty', 3, { s: 'cement, drť mramoru', v: 'podlahy, schody, parapety' }], // teraco
    ['Q2075380', 'stavebni-hmoty', 2, { s: 'cement, azbest nebo jiná vlákna', v: 'střešní a fasádní desky' }], // eternit
    ['Q40089', 'stavebni-hmoty', 1, { s: 'pálená hlína', v: 'zdi, komíny, dlažby', vy: 'vypalování hlíny v peci' }], // cihla
    ['Q1993315', 'stavebni-hmoty', 1, { s: 'skleněná vlákna', v: 'tepelné a zvukové izolace' }], // skelná vata
    ['Q202251', 'stavebni-hmoty', 1, { v: 'silnice, střešní lepenky, izolace', vy: 'zbytek po destilaci ropy' }], // asfalt
    ['Q186209', 'stavebni-hmoty', 1, { v: 'střešní lepenky, impregnace dřeva', vy: 'suchá destilace uhlí nebo dřeva' }], // dehet
    ['Q271768', 'stavebni-hmoty', 2, { v: 'stavební kamenivo, cement, silnice', vy: 'vedlejší produkt výroby kovů' }], // struska
    ['Q108728', 'stavebni-hmoty', 2, { s: 'lněný olej, korková moučka, juta', v: 'podlahové krytiny', by: 'Frederick Walton' }], // linoleum

    // --- Paliva a ropné produkty ---
    ['Q22656', 'paliva', 1, { s: 'směs uhlovodíků', v: 'výroba paliv a plastů', vy: 'těží se z vrtů', dens: 0.85 }], // ropa
    ['Q40858', 'paliva', 1, { s: 'hlavně methan', v: 'vytápění, vaření, elektrárny' }], // zemní plyn
    ['Q39558', 'paliva', 1, { s: 'směs uhlovodíků', v: 'palivo zážehových motorů', vy: 'destilace ropy', dens: 0.74 }], // benzín
    ['Q38423', 'paliva', 1, { s: 'směs uhlovodíků', v: 'palivo vznětových motorů', vy: 'destilace ropy', dens: 0.83, al: ['Nafta'] }], // motorová nafta
    ['Q167947', 'paliva', 1, { s: 'methylestery mastných kyselin', v: 'palivo vznětových motorů', vy: 'z řepkového nebo jiného rostlinného oleje' }], // bionafta
    ['Q76904', 'paliva', 1, { v: 'petrolejové lampy, palivo proudových letadel', vy: 'destilace ropy', dens: 0.81 }], // petrolej
    ['Q351609', 'paliva', 1, { s: 'propan, butan', v: 'pohon aut, plynové bomby', al: ['Zkapalněný ropný plyn', 'Propan-butan'] }], // LPG
    ['Q898757', 'paliva', 2, { v: 'palivo lodí, tepláren a elektráren', vy: 'zbytek po destilaci ropy' }], // mazut
    ['Q912189', 'paliva', 3, { s: 'lehké alkany', v: 'rozpouštědlo', vy: 'destilace ropy' }], // petrolether
    ['Q177540', 'paliva', 1, { s: 'směs alkanů', v: 'svíčky, kosmetika, impregnace', vy: 'z ropy' }], // parafín
    ['Q457239', 'paliva', 1, { s: 'směs uhlovodíků', v: 'kosmetika, mazání, ochrana kůže', vy: 'z ropy' }], // vazelína
    ['Q193784', 'paliva', 1, { s: 'ropné nebo syntetické oleje s přísadami', v: 'mazání motorů' }], // motorový olej
    ['Q192795', 'paliva', 1, { s: 'uhlík', v: 'vysoké pece, slévárny', vy: 'zahřívání černého uhlí bez přístupu vzduchu' }], // koks
    ['Q177463', 'paliva', 1, { s: 'uhlík', v: 'grilování, kování, kreslení', vy: 'zuhelnatění dřeva bez přístupu vzduchu' }], // dřevěné uhlí
    ['Q171076', 'paliva', 1, { s: 'methan, oxid uhličitý', v: 'výroba elektřiny a tepla', vy: 'kvašení hnoje, kalů a rostlinných zbytků' }], // bioplyn
    ['Q842311', 'paliva', 2, { s: 'vodík, methan, oxid uhelnatý', v: 'pouliční osvětlení a vaření v 19. století', vy: 'zplyňování uhlí' }], // svítiplyn

    // --- Papír, dřevo a vlákna ---
    ['Q11472', 'papir-vlakna', 1, { s: 'celulózová vlákna', v: 'psaní, tisk, obaly', vy: 'ze dřeva nebo hadrů' }], // papír
    ['Q389782', 'papir-vlakna', 1, { s: 'několik vrstev papíroviny', v: 'krabice, obaly, střešní krytina', al: ['Karton'] }], // lepenka
    ['Q1143474', 'papir-vlakna', 2, { s: 'průsvitný papír', v: 'technické výkresy, obkreslování' }], // pauzovací papír
    ['Q142274', 'papir-vlakna', 1, { s: 'papír nebo plátno se zrny korundu', v: 'hlazení dřeva, kovu a laku', al: ['Smirkový papír'] }], // brusný papír
    ['Q226697', 'papir-vlakna', 1, { s: 'upravená zvířecí kůže', v: 'středověké rukopisy a listiny' }], // pergamen
    ['Q125576', 'papir-vlakna', 1, { s: 'dřeň šáchoru', v: 'psaní ve starověkém Egyptě' }], // papyrus
    ['Q80294', 'papir-vlakna', 1, { s: 'dlouhé řetězce glukózy', v: 'výroba papíru a textilních vláken', vy: 'ze dřeva a bavlny' }], // celulóza
    ['Q287', 'papir-vlakna', 1, { s: 'celulóza, lignin', v: 'stavby, nábytek, palivo, papír' }], // dřevo
    ['Q219803', 'papir-vlakna', 1, { s: 'slepené tenké vrstvy dřeva', v: 'nábytek, obaly, podlahy' }], // překližka
    ['Q2307034', 'papir-vlakna', 1, { s: 'drcené dřevo a lepidlo', v: 'nábytek, podlahy' }], // dřevotříska
    ['Q477683', 'papir-vlakna', 2, { s: 'tenký plát dřeva', v: 'povrch nábytku a dveří' }], // dýha
    ['Q49444', 'papir-vlakna', 1, { v: 'zátky, nástěnky, izolace, podlahy', vy: 'kůra korkového dubu', dens: 0.24 }], // korek
    ['Q11457', 'papir-vlakna', 1, { s: 'celulóza', v: 'trička, ručníky, vata', vy: 'chmýří semen bavlníku' }], // bavlna
    ['Q1426327', 'papir-vlakna', 1, { n: 'Len', v: 'ubrusy, ložní prádlo, letní oblečení', vy: 'vlákna ze stonků lnu' }], // lněná tkanina
    ['Q107211', 'papir-vlakna', 2, { v: 'pytle, provazy, koberce', vy: 'vlákna ze stonků jutovníku' }], // juta
    ['Q847423', 'papir-vlakna', 3, { v: 'lana, provazy, rohožky', vy: 'vlákna z listů agáve' }], // sisal
    ['Q37681', 'papir-vlakna', 1, { s: 'bílkovina fibroin', v: 'šátky, kravaty, luxusní oděvy', vy: 'z kokonů bource morušového' }], // hedvábí
    ['Q1422359', 'papir-vlakna', 1, { s: 'bílkovina keratin', v: 'svetry, ponožky, deky', vy: 'stříhání ovcí', al: ['Vlna'] }], // ovčí vlna
    ['Q910194', 'papir-vlakna', 2, { s: 'regenerovaná celulóza', v: 'oděvy, podšívky', al: ['Viskóza', 'Umělé hedvábí'] }], // viskózové vlákno
    ['Q189964', 'papir-vlakna', 1, { s: 'zplstěná vlna nebo jiná vlákna', v: 'klobouky, bačkory, podložky', al: ['Plsť', 'Filc'] }], // plst
    ['Q638703', 'papir-vlakna', 3, { s: 'vlákna spojená bez tkaní', v: 'roušky, utěrky, geotextilie' }], // netkaná textilie
    ['Q286', 'papir-vlakna', 2, { v: 'boty, kabelky, opasky, bundy', vy: 'vyčinění zvířecí kůže', al: ['Kůže'] }], // useň
    ['Q160066', 'papir-vlakna', 1, { s: 'suché stonky obilí', v: 'stelivo, krmivo, doškové střechy', im: 'Champs DSC01381.JPG' }], // sláma

    // --- Barvy, laky a lepidla ---
    ['Q11236878', 'barvy-lepidla', 1, { s: 'pryskyřice v rozpouštědle', v: 'nátěry dřeva a kovu, nehty' }], // lak
    ['Q161179', 'barvy-lepidla', 1, { v: 'barvy, inkousty, plasty, kosmetika' }], // pigment
    ['Q127418', 'barvy-lepidla', 1, { s: 'barvivo nebo pigment ve vodě', v: 'psaní, tisk' }], // inkoust
    ['Q12981547', 'barvy-lepidla', 1, { s: 'saze, pojivo', v: 'kresba, kaligrafie' }], // tuš
    ['Q296955', 'barvy-lepidla', 1, { s: 'pigment, lněný olej', v: 'malba obrazů' }], // olejová barva
    ['Q207849', 'barvy-lepidla', 2, { s: 'pigment, akrylátová pryskyřice, voda', v: 'malba, nátěry' }], // akrylová barva
    ['Q175166', 'barvy-lepidla', 2, { s: 'pigment, vaječný žloutek, voda', v: 'malba ikon a obrazů' }], // tempera
    ['Q131790', 'barvy-lepidla', 1, { v: 'spojování papíru, dřeva a dalších materiálů' }], // lepidlo
    ['Q427161', 'barvy-lepidla', 2, { v: 'vteřinová lepidla', year: 1942, by: 'Harry Coover', al: ['Vteřinové lepidlo'] }], // kyanoakrylát
    ['Q1337073', 'barvy-lepidla', 1, { s: 'plavená křída, lněný olej', v: 'utěsnění oken a spár' }], // tmel
    ['Q145205', 'barvy-lepidla', 1, { v: 'laky, lepidla, kadidlo', vy: 'výměšek jehličnanů a dalších rostlin', im: 'Resin with insect (aka).jpg' }], // pryskyřice
    ['Q138937', 'barvy-lepidla', 2, { v: 'smyčce houslí, pájení', vy: 'zbytek po destilaci borovicové mízy', im: '' }], // kalafuna
    ['Q429659', 'barvy-lepidla', 2, { v: 'politury, laky na nábytek', vy: 'výměšek drobného hmyzu červců' }], // šelak
    ['Q201382', 'barvy-lepidla', 2, { v: 'ředění olejových barev a laků', vy: 'destilace pryskyřice jehličnanů' }], // terpentýn
    ['Q124695', 'barvy-lepidla', 1, { v: 'svíčky, leštidla, kosmetika' }], // vosk
    ['Q839494', 'barvy-lepidla', 2, { v: 'leštidla, autovosky, poleva bonbonů', vy: 'z listů brazilské palmy' }], // karnaubský vosk
    ['Q840688', 'barvy-lepidla', 1, { s: 'vosk, olej, plnivo', v: 'modelování', year: 1897, by: 'William Harbutt', im: '' }], // plastelína

    // --- Výbušniny a zápalné směsi ---
    ['Q12861', 'vybusniny', 1, { s: 'ledek, dřevěné uhlí, síra', v: 'střelivo, ohňostroje' }], // střelný prach
    ['Q80728', 'vybusniny', 1, { s: 'nitroglycerin nasáklý v křemelině', v: 'trhací práce v lomech a dolech', year: 1867, by: 'Alfred Nobel', im: 'Inserting dynamite into hole.jpg' }], // dynamit
    ['Q62627', 'vybusniny', 1, { s: 'pentrit, hexogen, změkčovadla', v: 'trhací práce, vojenství', by: 'Stanislav Brebera', im: '' }], // semtex
    ['Q220775', 'vybusniny', 2, { s: 'hexogen, změkčovadla', v: 'vojenské trhací práce' }], // C-4
    ['Q181822', 'vybusniny', 1, { s: 'zahuštěný benzín', v: 'zápalné zbraně', year: 1942, by: 'Louis Fieser' }], // napalm
    ['Q179537', 'vybusniny', 2, { v: 'byzantské námořní bitvy', year: 672, by: 'Kallinikos' }], // řecký oheň
    ['Q143874', 'vybusniny', 2, { v: 'bezdýmný střelný prach, laky, celuloid', vy: 'působení kyseliny dusičné na celulózu' }], // nitrocelulóza
    ['Q905964', 'vybusniny', 3, { s: 'nitrocelulóza, nitroglycerin', v: 'náplně nábojů a granátů', year: 1889, by: 'Frederick Abel a James Dewar' }], // kordit

    // --- Čisticí prostředky a hnojiva ---
    ['Q34396', 'cistidla-hnojiva', 1, { s: 'sodné nebo draselné soli mastných kyselin', v: 'mytí, praní', vy: 'zmýdelnění tuků' }], // mýdlo
    ['Q334637', 'cistidla-hnojiva', 2, { s: 'tenzidy', v: 'mycí a prací prostředky' }], // detergent
    ['Q910284', 'cistidla-hnojiva', 1, { s: 'tenzidy, změkčovadla vody, enzymy', v: 'praní prádla', al: ['Prací prášek'] }], // prací prostředek
    ['Q83323', 'cistidla-hnojiva', 1, { s: 'dusík, fosfor, draslík', v: 'výživa rostlin' }], // hnojivo
    ['Q212254', 'cistidla-hnojiva', 1, { s: 'rozložené rostlinné zbytky', v: 'hnojení zahrad a polí', vy: 'tlení za přístupu vzduchu' }], // kompost
    ['Q899094', 'cistidla-hnojiva', 3, { s: 'dihydrogenfosforečnan vápenatý, sádrovec', v: 'hnojení polí', year: 1842, by: 'John Bennet Lawes' }] // superfosfát
];

export const MATERIAL_IDS = new Set(MATERIALS.map(([qid]) => qid));
export const MATERIAL_GROUP_IDS = new Set(MATERIAL_COLLECTIONS.map(collection => collection.id));

// Fotka položky: im v záznamu nahradí fotku z Wikidat (jiná fotka téže položky z Wikidat), prázdný řetězec = bez fotky.
// Bez fotky jsou položky, jejichž jediná fotka má napsanou odpověď (krabička PLASTILINA, SEMTEX-H, štítek KEVLAR, cívka
// Konstantan, plechovka Kolophonium); jinou fotku mají dynamit (bedna s nápisem DYNAMITE), sláma (zeď z nepálených cihel),
// polyuretan, pryskyřice (stejná fotka jako epoxidová pryskyřice)
export const materialImage = (facts, wikidataImage) => {
    if (facts.im === undefined) return wikidataImage;
    return facts.im ? `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(facts.im)}` : undefined;
};

// Fakta položky do f (jen vyplněné)
export const materialFacts = (facts) => Object.fromEntries(['s', 'v', 'vy', 'year', 'by', 'bf', 'dens', 'al'].filter(key => facts[key] !== undefined).map(key => [key, facts[key]]));
