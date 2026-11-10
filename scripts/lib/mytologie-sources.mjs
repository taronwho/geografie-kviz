// Zdroje mytologie nad rámec tříd z Wikidat: kategorie české Wikipedie (bohové a hrdinové jednotlivých mytologií)
// a ruční seznamy názvů článků (bájné bytosti, místa a předměty, postavy, které v kategoriích nejsou)
// Kategorie se stahují z API české Wikipedie při sestavení (BUILD_CACHE je uloží), seznamy jsou níže.
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Členové kategorie (jen články), s opakováním při omezení počtu požadavků
export const categoryMembers = async (category) => {
    const titles = [];
    let cont = {};
    do {
        const params = new URLSearchParams({ format: 'json', action: 'query', list: 'categorymembers', cmtitle: `Kategorie:${category}`, cmlimit: '500', cmnamespace: '0', ...cont });
        let json;
        for (let attempt = 1; attempt <= 6 && !json; attempt++) {
            try {
                const response = await fetch(`https://cs.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT } });
                json = JSON.parse(await response.text());
            } catch {
                console.warn(`  kategorie ${category}: zkouším znovu (${attempt}/6)`);
                await sleep(5000 * attempt);
            }
        }
        if (!json) throw new Error(`Kategorie ${category} se nepodařilo stáhnout`);
        titles.push(...json.query.categorymembers.map(member => member.title));
        cont = json.continue || null;
        await sleep(300);
    } while (cont);
    return titles;
};

// Kategorie, jejichž členové jsou postavy (bohové a hrdinové); deity = ve všech jde o božstva, female = bohyně
// Členové, kteří už jsou mezi kandidáty z Wikidat (Apollón, Jupiter), se nemění
export const FORCED_SOURCES = [
    { cat: 'Hrdinové a postavy řecké mytologie', myths: ['recka'] },
    { cat: 'Řečtí bohové', myths: ['recka'], deity: true },
    { cat: 'Římští bohové', myths: ['rimska'], deity: true },
    { cat: 'Římské bohyně', myths: ['rimska'], deity: true, female: true },
    { cat: 'Egyptští bohové', myths: ['egyptska'], deity: true },
    { cat: 'Severští bohové', myths: ['severska'], deity: true },
    { cat: 'Hinduistická božstva', myths: ['indicka'], deity: true },
    { cat: 'Hinduistické bohyně', myths: ['indicka'], deity: true, female: true },
    { cat: 'Sumersko-akkadští bohové', myths: ['mezopotamska'], deity: true },
    { cat: 'Kanaánská božstva', myths: ['kanaanska'], deity: true },
    { cat: 'Aztécká božstva', myths: ['aztecka'], deity: true },
    { cat: 'Incká božstva', myths: ['incka'], deity: true },
    { cat: 'Čínští bohové', myths: ['cinska'], deity: true },
    { cat: 'Japonská božstva', myths: ['japonska'], deity: true },
    { cat: 'Artušovské postavy', myths: ['artus'] }
];

// Z kategorií se nevezme skupina božstev, historická osoba, pojem ani seznam (nejsou to postavy)
export const FORCED_EXCLUDE = new Set([
    'Ásové', 'Vanové', 'Dísy', 'Norny', 'Larové', 'Penáti', 'Osmero', 'Devatero', 'Egyptští bohové', 'Anunnaki', 'Igigi', 'Anšar a Kišar', 'Trimúrti',
    'Marutové', 'Magnus Maximus', 'Král Lot', 'Rjóma Sakamoto', 'Sutoku', 'Čchü Jüan', 'Jama (buddhismus)', 'Tři hvězdná božstva', 'Imhotep',
    'Hermes Trismegistos', 'Amenhotep, syn Hapuův', 'Hapi (syn Hora)', 'Rytíři Kulatého stolu', 'Brahman', 'Íšvara', 'Puruša', 'Hiranjagarbha',
    'Budha', 'Ila', 'Angiras', 'Šačí', 'Trita Áptja', 'Áditjové', 'Vasuové', 'Ápah', 'Déví', 'Šakti', 'Tárá (déví)', 'Kumárí', 'Súrjá', 'Anša',
    'Nymfy', 'Semiramis', 'Roma (mytologie)', 'Nanna (sumerská mytologie)', 'Agdistis', 'Sabazios', 'Acratopótes', 'Adefagie', 'Aergia', 'Afaia', 'Agathodaimon (mytologie)', 'Afrodité Úrania'
]);

// Ruční seznamy: názvy článků a mytologie; deity = božstvo, ty = druh (jinak „mytická postava“)
export const FORCED_LISTS = [
    { myths: ['indicka'], deity: true, titles: ['Ráma'] },
    { myths: ['indicka'], titles: ['Rávana'] },
    { myths: ['keltska'], deity: true, titles: ['Cernunnos', 'Epona', 'Lugh', 'Brigid', 'Taranis', 'Morrígan', 'Aengus', 'Núadu', 'Artio', 'Sucellus', 'Ogma', 'Esus', 'Danu', 'Belenus', 'Rhiannon'] },
    { myths: ['keltska'], titles: ['Scathach', 'Medb', 'Branwen', 'Mabon'] },
    { myths: ['artus'], titles: ['Merlin', 'Král Artuš', 'Lancelot', 'Morgana', 'Mordred', 'Guinevere', 'Taliesin', 'Vortigern', 'Bedivere'] },
    { myths: ['japonska'], titles: ['Momotaró', 'Ugajafukiaezu'] },
    { myths: ['mezopotamska'], titles: ['Gilgameš', 'Enkidu', 'Utnapištim'] },
    { myths: ['mezopotamska'], deity: true, titles: ['Ninkasi', 'Nammu', 'Namtar', 'Iškur'] },
    { myths: ['cinska'], titles: ['Sun Wu-kchung', 'Čung Kchuej', 'Pangu', 'Žlutý císař', 'Šen-nung'] },
    { myths: ['cinska'], deity: true, titles: ['Kuan-jin', 'Dračí král'] },
    { myths: ['mayska'], deity: true, titles: ['Chaac', 'Ix Chel', 'Kinich Ahau', 'Hunab Ku', 'Huracan'] },
    { myths: ['perska'], titles: ['Džamšíd', 'Gajómart', 'Isfandijár', 'Keresáspa'] },
    { myths: ['perska'], deity: true, titles: ['Ahura Mazda', 'Angra Mainju'] },
    { myths: ['recka'], titles: ['Sófrosyné', 'Sibyla'] },
    { myths: ['rimska'], titles: ['Romulus a Remus', 'Rhea Silvia', 'Numitor', 'Faustulus'] },
    { myths: ['egyptska'], deity: true, titles: ['Apedemak', 'Hapi (bůh záplav)', 'Harpokratés', 'Hatmehit', 'Hemen', 'Mehet'] },
    // Další postavy (ty = druh, female = žena, když ho Wikidata neuvádějí); ruční seznamy nepotřebují fotku – otázku nese úvod článku
    // Severská mytologie
    { myths: ['severska'], deity: true, titles: ['Mani (bůh)', 'Magni', 'Módi'] },
    { myths: ['severska'], female: true, ty: 'norna', titles: ['Skuld'] },
    { myths: ['severska'], ty: 'trpaslík', titles: ['Brokk', 'Sindri'] },
    { myths: ['severska'], ty: 'první lidé', titles: ['Ask a Embla'] },
    { myths: ['severska'], titles: ['Aurvandil'] },
    // Keltská mytologie
    { myths: ['keltska'], deity: true, titles: ['Dagda (keltský bůh)', 'Toutatis', 'Ogmios', 'Nodens', 'Bres', 'Cian', 'Goibniu', 'Grannus', 'Lugus', 'Midir', 'Smertrios', 'Abellio (keltský bůh)'] },
    { myths: ['keltska'], deity: true, female: true, titles: ['Macha', 'Belisama', 'Badb', 'Áine', 'Arianrhod', 'Bóand', 'Anu (bohyně)', 'Sequana', 'Airmid'] },
    { myths: ['keltska'], ty: 'hrdina', titles: ['Cúchulainn'] },
    { myths: ['keltska'], ty: 'hrdinka', female: true, titles: ['Aífe'] },
    // Slované, Rusové, Poláci (pověsti a lidová víra)
    { myths: ['slovanska'], deity: true, titles: ['Pohvizd', 'Trojan (bůh)'] },
    { myths: ['slovanska'], ty: 'božská dvojčata', titles: ['Lel a Polel'] },
    { myths: ['slovanska'], deity: true, female: true, titles: ['Vesna', 'Perchta'] },
    { myths: ['slovanska'], ty: 'postava lidových pohádek', titles: ['Děda Mráz', 'Sněhurka (ruský folklór)'] },
    { myths: ['slovanska'], ty: 'bájný vládce', titles: ['Kníže Lech', 'Krak (kníže)', 'Popiel II.', 'Gostomysl'] },
    { myths: ['slovanska'], ty: 'bájná kněžna', female: true, titles: ['Wanda (kněžna)'] },
    { myths: ['slovanska'], ty: 'hrdina', titles: ['Ivan Carevič'] },
    { myths: ['slovanska'], ty: 'lidový hrdina', titles: ['Juraj Jánošík'] },
    { myths: ['slovanska'], titles: ['Solověj-Razbojnik', 'Bojan (staroruský básník)', 'Pan Twardowski'] },
    // Egypt
    { myths: ['egyptska'], deity: true, titles: ['Am-Heh', 'Aken', 'Ba-Pef', 'Achty (bůh)', 'Veneg'] },
    { myths: ['egyptska'], deity: true, female: true, titles: ['Hededet', 'Jat (bohyně)'] },
    // Indie
    { myths: ['indicka'], deity: true, titles: ['Nandi', 'Djaus', 'Mahákála', 'Tvaštr', 'Arjaman', 'Savitar', 'Púšan', 'Bhaga', 'Pardžanja'] },
    { myths: ['indicka'], deity: true, female: true, titles: ['Ušas', 'Diti'] },
    { myths: ['indicka'], ty: 'apsara', female: true, titles: ['Urvaší'] },
    { myths: ['indicka'], ty: 'první člověk', titles: ['Manu'] },
    { myths: ['indicka'], ty: 'mudrc', titles: ['Kašjapa'] },
    // Mezopotámie a Persie
    { myths: ['mezopotamska'], deity: true, titles: ['Dumuzi', 'Abzu', 'Enkimdu'] },
    { myths: ['mezopotamska'], deity: true, female: true, titles: ['Sarpanit'] },
    { myths: ['perska'], deity: true, titles: ['Mithra', 'Zurvan', 'Verethragna'] },
    { myths: ['perska'], deity: true, female: true, titles: ['Anáhitá'] },
    { myths: ['perska'], ty: 'bájný král', titles: ['Ferídún'] },
    // Japonsko a Čína
    { myths: ['japonska'], deity: true, titles: ['Cukujomi', 'Hotei'] },
    { myths: ['cinska'], ty: 'bájný císař', titles: ['Jao (vládce)', 'Šun (vládce)', 'Čuan-sü'] },
    { myths: ['cinska'], deity: true, female: true, titles: ['Čchang-si'] },
    // Inkové
    { myths: ['incka'], ty: 'bájný vládce', titles: ['Manco Capac'] },
    // Řecko: prvotní bohové, větry, nymfy, titáni, giganti a kentauři, které třídy z Wikidat nezachytí
    { myths: ['recka'], deity: true, titles: ['Chaos (mytologie)', 'Erebos', 'Aithér', 'Chronos', 'Ofión', 'Zefyros', 'Euros', 'Notos', 'Próteus', 'Fantasos', 'Aión (mytologie)'] },
    { myths: ['recka'], deity: true, female: true, titles: ['Peithó', 'Elpis', 'Áté', 'Apaté', 'Eurybia', 'Despoina'] },
    { myths: ['recka'], ty: 'nymfa', female: true, titles: ['Echó', 'Maia (mytologie)', 'Dafné', 'Amaltheia (mytologie)', 'Galateia', 'Mintha', 'Rhodé', 'Eurynomé (ókeanovna)'] },
    { myths: ['recka'], ty: 'erínye', female: true, titles: ['Megaira', 'Alléktó'] },
    { myths: ['recka'], ty: 'titán', titles: ['Persés', 'Menoitios'] },
    { myths: ['recka'], ty: 'gigant', titles: ['Enkelados', 'Porfyrión', 'Alkyoneus', 'Mimas (mytologie)'] },
    { myths: ['recka'], ty: 'kentaur', titles: ['Nessos', 'Folos'] },
    // Řím
    { myths: ['rimska'], deity: true, titles: ['Terminus (mytologie)', 'Vertumnus', 'Dispater', 'Tiberinus', 'Pales'] },
    { myths: ['rimska'], deity: true, female: true, titles: ['Pomona', 'Juturna', 'Veritas', 'Angerona', 'Mater Matuta', 'Lucina (mytologie)', 'Virtus (bohyně)', 'Carmenta', 'Libertas'] }
];

// Bájné bytosti: název článku → [druh, mytologie]
export const FORCED_CREATURES = {
    'Banshee': ['bájná bytost', ['keltska']], 'Leprikón': ['bájná bytost', ['keltska']], 'Kelpie': ['bájná bytost', ['keltska']],
    'Selkie': ['bájná bytost', ['keltska']], 'Each uisge': ['bájná bytost', ['keltska']], 'Sídhe': ['bájná bytost', ['keltska']],
    'Jókai': ['bájná bytost', ['japonska']], 'Juki onna': ['bájná bytost', ['japonska']], 'Kappa (japonský folklór)': ['bájná bytost', ['japonska']],
    'Kicune': ['bájná bytost', ['japonska']], 'Namazu': ['bájná bytost', ['japonska']], 'Nekomata': ['bájná bytost', ['japonska']],
    'Oni (mytologie)': ['bájná bytost', ['japonska']], 'Tanuki': ['bájná bytost', ['japonska']], 'Šinigami': ['bájná bytost', ['japonska']],
    'Čchi-lin': ['bájná bytost', ['cinska']], 'Feng-chuang': ['bájná bytost', ['cinska']], 'Pi-si': ['bájná bytost', ['cinska']],
    'Pchi-siou': ['bájná bytost', ['cinska']], 'Měsíční zajíc': ['bájná bytost', ['cinska']],
    'Rákšasa': ['bájná bytost', ['indicka']], 'Asura': ['bájná bytost', ['indicka']], 'Jakša': ['bájná bytost', ['indicka']],
    'Aladlammú': ['bájná bytost', ['mezopotamska']], 'Anzu': ['bájná bytost', ['mezopotamska']], 'Chuvava': ['bájná bytost', ['mezopotamska']],
    'Pazúzu': ['bájná bytost', ['mezopotamska']], 'Aži Daháka': ['bájná bytost', ['perska']], 'Símurg': ['bájná bytost', ['perska']],
    'Šahmaran': ['bájná bytost', ['perska']], 'Benu': ['bájná bytost', ['egyptska']],
    'Michael (archanděl)': ['archanděl', ['biblicka']], 'Gabriel (archanděl)': ['archanděl', ['biblicka']], 'Rafael (archanděl)': ['archanděl', ['biblicka']],
    'Azrael': ['anděl smrti', ['biblicka']], 'Metatron': ['anděl', ['biblicka']], 'Raziel': ['anděl', ['biblicka']], 'Samael': ['anděl smrti', ['biblicka']],
    'Cherub': ['anděl', ['biblicka']], 'Seraf': ['anděl', ['biblicka']], 'Adramelech': ['démon', ['biblicka']], 'Lilith': ['démon', ['biblicka']],
    'Satan': ['ďábel', ['biblicka']], 'Belzebub': ['démon', ['biblicka']], 'Azazel': ['padlý anděl', ['biblicka']],
    // Další bytosti (prázdná mytologie = bytost z pověstí více národů, otázka „Ze které mytologie?“ se u ní neklade)
    'Tanngnjóst a Tanngrisni': ['bájní kozli', ['severska']], 'Tomte': ['bájná bytost', ['severska']], 'Fylgja': ['duch', ['severska']],
    'Losos moudrosti': ['bájná bytost', ['keltska']], 'Merrow': ['bájná bytost', ['keltska']], 'Leannan Sidhe': ['bájná bytost', ['keltska']],
    'Alkonost': ['bájný pták', ['slovanska']], 'Sirin': ['bájný pták', ['slovanska']], 'Gamajun': ['bájný pták', ['slovanska']], 'Rarog': ['bájný pták', ['slovanska']],
    'Sudička': ['bájná bytost', ['slovanska']], 'Drekavac': ['bájná bytost', ['slovanska']], 'Šišiga': ['bájná bytost', ['slovanska']],
    'Psohlavec (folklór)': ['bájná bytost', ['slovanska']], 'Ala (mytologie)': ['bájná bytost', ['slovanska']], 'Bohynka': ['démon', ['slovanska']],
    'Ovinnik': ['duch', ['slovanska']], 'Vij (mytologie)': ['démon', ['slovanska']], 'Zlatorog': ['bájné zvíře', ['slovanska']],
    'Nága': ['bájná bytost', ['indicka']], 'Apsaras': ['nebeská nymfa', ['indicka']], 'Gandharva': ['bájná bytost', ['indicka']], 'Makara': ['bájná bytost', ['indicka']],
    'Vrtra': ['démonický had', ['indicka']], 'Ananta': ['bájný had', ['indicka']], 'Lilú': ['démon', ['mezopotamska']],
    'Ahuizotl (démon)': ['bájná bytost', ['aztecka']], 'Amaru (mytologie)': ['bájný had', ['incka']],
    'Kučisake-onna': ['bájná bytost', ['japonska']], 'Amazake babá': ['bájná bytost', ['japonska']], "Sie-č'": ['bájná bytost', ['cinska']],
    'Charybda': ['mořská nestvůra', ['recka']], 'Týfón': ['nestvůra', ['recka']], 'Stymfalští ptáci': ['bájní ptáci', ['recka']],
    'Krommyónská svině': ['bájné zvíře', ['recka']], 'Argos (pes)': ['bájný pes', ['recka']],
    'Leviatan': ['biblická nestvůra', ['biblicka']], 'Behemot': ['biblická nestvůra', ['biblicka']], 'Uriel (archanděl)': ['archanděl', ['biblicka']],
    'Abaddón': ['anděl zkázy', ['biblicka']], 'Asmodeus': ['démon', ['biblicka']], 'Bélial': ['démon', ['biblicka']], 'Mamon': ['démon', ['biblicka']],
    'Belfegor': ['démon', ['biblicka']], 'Agares': ['démon', ['biblicka']], 'Paimon': ['démon', ['biblicka']], 'Haniel': ['archanděl', ['biblicka']],
    'Raguel': ['archanděl', ['biblicka']], 'Mefistofeles': ['ďábel z pověsti o Faustovi', ['biblicka']],
    'Hulder': ['lesní bytost', ['severska']], 'Huldufólk': ['skrytý lid', ['severska']], 'Svadilfari': ['bájný kůň', ['severska']], 'Hati': ['bájný vlk', ['severska']],
    'Einherjové': ['padlí bojovníci', ['severska']],
    'Mantikora': ['bájná bytost', []], 'Hipogryf': ['bájná bytost', []], 'Wyverna': ['bájná bytost', []], 'Gnóm': ['bájná bytost', []], 'Goblin': ['bájná bytost', []],
    'Skřet': ['bájná bytost', []], 'Kobold': ['bájná bytost', []], 'Krampus': ['bájná bytost', []], 'Ghúl': ['bájná bytost', []], 'Imp': ['bájná bytost', []],
    'Tarasque': ['bájná bytost', []], 'Tatzelwurm': ['bájná bytost', []], 'Kokatrice': ['bájná bytost', []], 'Bunyip': ['bájná bytost', []],
    'Hromový pták': ['bájný pták', []], 'Burák (kůň)': ['bájný kůň', []], 'Džin': ['bájná bytost', []], 'Iblís': ['ďábel', []], 'Šajtán': ['ďábel', []],
    'Smrtka': ['zosobněná smrt', []], 'Podhozenec': ['bájná bytost', []], 'Kallikantzaros': ['bájná bytost', []]
};

// Bájná místa a předměty: název článku → [druh, mytologie]
export const FORCED_OBJECTS = {
    'Aigis': ['bájný předmět', ['recka']], 'Ambrózie a nektar': ['bájný předmět', ['recka']], 'Roh hojnosti': ['bájný předmět', ['recka']],
    'Zlaté rouno': ['bájný předmět', ['recka']], 'Argó': ['bájná loď', ['recka']], 'Caduceus': ['bájný předmět', ['recka']],
    'Excalibur': ['bájný předmět', ['artus']], 'Svatý grál': ['bájný předmět', ['artus']], 'Amrta': ['bájný předmět', ['indicka']],
    'Vadžra': ['bájný předmět', ['indicka']], 'Japonské císařské regálie': ['bájné předměty', ['japonska']],
    'Méru': ['bájná hora', ['indicka']], 'Atlantida': ['bájný ostrov', []], 'Thule': ['bájný ostrov', []], 'Antillia': ['bájný ostrov', []],
    'Bujan': ['bájný ostrov', ['slovanska']], 'Kitěž': ['bájné město', ['slovanska']], 'Styx': ['bájná řeka', ['recka']],
    'Tartaros': ['bájné místo', ['recka']], 'Valhalla': ['bájné místo', ['severska']], 'Midgard': ['bájné místo', ['severska']],
    'Yggdrasil': ['bájný strom', ['severska']], 'Duat': ['bájné místo', ['egyptska']], 'Benben': ['bájné místo', ['egyptska']],
    'Dilmun': ['bájné místo', ['mezopotamska']], 'Ys': ['bájné město', ['keltska']], 'Mjölnir': ['bájný předmět', ['severska']],
    'Gungnir': ['bájný předmět', ['severska']], 'El Dorado': ['bájné město', []],
    // Devět světů a další místa a předměty severské mytologie (česká Wikipedie má Mjöllni a Gungni, ne Mjölnir a Gungnir)
    'Ásgard': ['bájná říše', ['severska']], 'Vanaheim': ['bájná říše', ['severska']], 'Jötunheim': ['bájná říše', ['severska']],
    'Niflheim': ['bájná říše', ['severska']], 'Múspellheim': ['bájná říše', ['severska']], 'Ljósálfheim': ['bájná říše', ['severska']],
    'Svartálfheim': ['bájná říše', ['severska']], 'Helheim': ['podsvětí', ['severska']], 'Ginnungagap': ['bájné místo', ['severska']],
    'Utgard': ['bájné místo', ['severska']], 'Bifröst': ['bájný most', ['severska']], 'Gjallarbrú': ['bájný most', ['severska']],
    'Urdina studna': ['bájný pramen', ['severska']], 'Mímiho studna': ['bájný pramen', ['severska']], 'Hlidskjalf': ['bájný trůn', ['severska']],
    'Mjöllni': ['bájná zbraň', ['severska']], 'Gungni': ['bájná zbraň', ['severska']], 'Draupni': ['bájný prsten', ['severska']],
    'Andvarinaut': ['bájný prsten', ['severska']], 'Naglfar': ['bájná loď', ['severska']], 'Skídbladni': ['bájná loď', ['severska']],
    'Hringhorni': ['bájná loď', ['severska']], 'Medovina básnictví': ['bájný nápoj', ['severska']],
    // Keltské, artušovské a slovanské
    'Kamelot (hrad)': ['bájný hrad', ['artus']], 'Avalon (ostrov)': ['bájný ostrov', ['artus']], 'Lyonesse': ['bájná země', ['artus']],
    'Kulatý stůl': ['bájný předmět', ['artus']], 'Tir na nOg': ['bájná země', ['keltska']], 'Annwn': ['podsvětí', ['keltska']],
    'Chaloupka na kuří nožce': ['bájné obydlí', ['slovanska']], 'Alatyr (mytologie)': ['bájný kámen', ['slovanska']], 'Nav': ['podsvětí', ['slovanska']],
    // Egyptské posvátné symboly
    'Anch': ['posvátný symbol', ['egyptska']], 'Vedžat': ['posvátný symbol', ['egyptska']], 'Džed': ['posvátný symbol', ['egyptska']],
    'Tijet': ['posvátný symbol', ['egyptska']], 'Šen (staroegyptský symbol)': ['posvátný symbol', ['egyptska']], 'Atef': ['posvátná koruna', ['egyptska']],
    'Imiut': ['posvátný předmět', ['egyptska']],
    // Řecké a další
    'Trójský kůň': ['bájný předmět', ['recka']], 'Élysion': ['bájné místo', ['recka']], 'Hyperborea': ['bájná země', ['recka']],
    'Ostrovy požehnaných': ['bájné ostrovy', ['recka']], 'Aiaia': ['bájný ostrov', ['recka']], 'Léthé': ['bájná řeka', ['recka']],
    'Pyriflegethón': ['bájná řeka', ['recka']], 'Mínóův labyrint': ['bájné místo', ['recka']], 'Symplégady': ['bájné skály', ['recka']],
    'Svarga': ['nebe bohů', ['indicka']], 'Naraka (hinduismus)': ['podsvětí', ['indicka']], 'Mictlan': ['podsvětí', ['aztecka']],
    'Xibalbá': ['podsvětí', ['mayska']], 'Chakana': ['posvátný symbol', ['incka']], 'Noemova archa': ['bájná loď', ['biblicka']],
    'Uroboros': ['bájný symbol', []]
};
// Názvy článků, pod kterými postavu či předmět česky zná málokdo: jméno v tématu (původní název zůstane jako další psaná odpověď)
export const NAME_OVERRIDES = { 'Mjöllni': 'Mjölnir', 'Gungni': 'Gungnir', 'Draupni': 'Draupnir', 'Hapi (býk)': 'Apis', 'Vedžat': 'Horovo oko' };
