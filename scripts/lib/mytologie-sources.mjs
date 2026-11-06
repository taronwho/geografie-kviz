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
    { myths: ['artus'], titles: ['Merlin', 'Král Artuš', 'Lancelot', 'Morgana', 'Mordred', 'Guinevere', 'Taliesin'] },
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
    { myths: ['egyptska'], deity: true, titles: ['Apedemak', 'Hapi (bůh záplav)', 'Harpokratés', 'Hatmehit', 'Hemen', 'Mehet'] }
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
    'Satan': ['ďábel', ['biblicka']], 'Belzebub': ['démon', ['biblicka']], 'Azazel': ['padlý anděl', ['biblicka']]
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
    'Gungnir': ['bájný předmět', ['severska']], 'El Dorado': ['bájné město', []]
};
