// Ruční tabulky Geologie nad rámec nerostů: geologické útvary a jevy, zkameněliny a další horniny a období.
// Názvy jsou názvy článků české Wikipedie; skript k nim dohledá Wikidata (fotka, popis) a položku bez skutečné fotky vynechá.
// Skupiny a příklady vypsané z geologických příruček (Wikidata je nemají).

// --- Útvary a jevy: název článku → [skupina, příklad nebo typické místo (nesmí obsahovat název útvaru)] ---
export const FORMS = {
    // sopečné
    'Kaldera': ['sopecne', 'Santorini, Yellowstone, Krakatoa'], 'Sopečný kráter': ['sopecne', 'vrchol Vesuvu a Etny'], 'Fumarola': ['sopecne', 'Vulcano, Kamčatka'],
    'Maar': ['sopecne', 'Eifel v Německu, Doupovské hory'], 'Štítová sopka': ['sopecne', 'Mauna Loa na Havaji'], 'Stratovulkán': ['sopecne', 'Fudži, Vesuv, Mayon'],
    'Sopečný dóm': ['sopecne', 'Mount St. Helens, Pelée'], 'Bahenní sopka': ['sopecne', 'Ázerbájdžán, Rumunsko (Berca)'], 'Lahar': ['sopecne', 'Nevado del Ruiz 1985, Pinatubo'],
    'Pyroklastický proud': ['sopecne', 'zánik Pompejí'], 'Sopečná puma': ['sopecne', 'vyvrženiny při explozivních erupcích'], 'Lávový proud': ['sopecne', 'Havaj, Island, Etna'],
    'Gejzír': ['sopecne', 'Island, Yellowstone, Nový Zéland'], 'Horká skvrna': ['sopecne', 'Havaj, Yellowstone, Island'],
    // ledovcové a periglaciální
    'Moréna': ['ledovcove', 'Alpy, Skandinávie'], 'Kar': ['ledovcove', 'Krkonoše, Tatry, Alpy'], 'Esker': ['ledovcove', 'Švédsko, Finsko, Kanada'], 'Drumlin': ['ledovcove', 'Irsko, severní Německo'],
    'Nunatak': ['ledovcove', 'Grónsko, Antarktida'], 'Fjord': ['ledovcove', 'Norsko, Grónsko, Chile'], 'Ledovcové údolí': ['ledovcove', 'Alpy, Tatry, Norsko'],
    'Bludný balvan': ['ledovcove', 'severní Morava a Slezsko, severní Evropa'], 'Serak': ['ledovcove', 'ledopády v Alpách a Himálaji'], 'Pingo': ['ledovcove', 'Sibiř, Aljaška, Kanada'],
    'Permafrost': ['ledovcove', 'Sibiř, Aljaška, Kanada'], 'Ledovcové jezero': ['ledovcove', 'Čertovo a Černé na Šumavě, Tatry'],
    // říční a pobřežní
    'Kaňon': ['vodni', 'Grand Canyon, Tara'], 'Meandr': ['vodni', 'dolní tok Mississippi, Vltava u Českého Krumlova'], 'Říční delta': ['vodni', 'Nil, Mississippi, Volha'],
    'Estuár': ['vodni', 'Temže, Seina, Labe u Hamburku'], 'Laguna': ['vodni', 'Benátky, Marshallovy ostrovy'], 'Korálový útes': ['vodni', 'Velká bariéra u Austrálie, Maledivy'],
    'Tombolo': ['vodni', 'Mont-Saint-Michel, Gibraltar'], 'Údolní niva': ['vodni', 'Polabí, Poodří'], 'Mrtvé rameno': ['vodni', 'Labe, Morava, Dyje'],
    'Soutěska': ['vodni', 'Hřensko, Tara, Vintgar'], 'Atol': ['vodni', 'Maledivy, Bikini'],
    // pouštní a zvětrávání
    'Duna': ['pousteni', 'Sahara, Namib, Gobi'], 'Vádí': ['pousteni', 'Sahara, Arabský poloostrov'], 'Playa': ['pousteni', 'Údolí smrti, Utah'], 'Skalní hřib': ['pousteni', 'Český ráj, Adršpach, Sahara'],
    'Skalní brána': ['pousteni', 'Českosaské Švýcarsko, Arches v USA'],
    // krasové
    'Stalaktit': ['krasove', 'Moravský kras, Postojna'], 'Stalagmit': ['krasove', 'Moravský kras, Postojna'], 'Stalagnát': ['krasove', 'Moravský kras, Postojna'],
    'Závrt': ['krasove', 'Macocha v Moravském krasu'], 'Polje': ['krasove', 'Dinárské hory, Slovinsko'], 'Vyvěračka': ['krasove', 'Moravský kras, Vaucluse ve Francii'],
    // tektonické
    'Zlom': ['tektonicke', 'Kalifornie (San Andreas), Krušné hory'], 'Příkrov': ['tektonicke', 'Alpy, Západní Karpaty'],
    'Subdukce': ['tektonicke', 'Pacifický ohnivý kruh'], 'Rift': ['tektonicke', 'Východoafrický příkop, Bajkal'], 'Kraton': ['tektonicke', 'Kanadský štít, Sibiř'],
    'Hlubokomořský příkop': ['tektonicke', 'Mariánský, Tonžský, Kurilský'], 'Příkop (geologie)': ['tektonicke', 'Hornorýnský, Ohárecký, Východoafrický'], 'Kontinentální šelf': ['tektonicke', 'Severní moře, Jihočínské moře'],
    'Hřbet (geomorfologie)': ['tektonicke', 'Středoatlantský, Východopacifický'],
    // horninová tělesa
    'Batolit': ['magmaticke', 'Sierra Nevada, Středočeský pluton'], 'Lakolit': ['magmaticke', 'Henry Mountains v Utahu'], 'Žíla (geologie)': ['magmaticke', 'rudní a křemenné, Příbramsko a Jáchymov'],
    'Xenolit': ['magmaticke', 'úlomky v čediči a žule'], 'Geoda': ['magmaticke', 'ametystové dutiny z Brazílie a Uruguaye'], 'Konkrece': ['magmaticke', 'vltavíny, pazourkové hlízy, moldavity'],
    // impakty
    'Impaktní kráter': ['impaktni', 'Chicxulub, Ries, Meteor Crater'], 'Impaktit': ['impaktni', 'kráter Ries v Německu'], 'Tektit': ['impaktni', 'vltavíny, libyjské sklo'],
    'Meteorit': ['impaktni', 'Hoba, Příbram 1959, Allende'], 'Chondrit': ['impaktni', 'Allende, Murchison'], 'Pallasit': ['impaktni', 'Brenham, Imilac'],
    // jevy
    'Zemětřesení': ['jevy', 'Lisabon 1755, Tohoku 2011'], 'Tsunami': ['jevy', 'Indický oceán 2004, Japonsko 2011'],
    // další sopečné útvary a jevy
    'Podmořská sopka': ['sopecne', 'Kolumbo u Santorini, Hunga Tonga'], 'Sopečné jezero': ['sopecne', 'Crater Lake v USA, Kelimutu v Indonésii'],
    'Lávový tunel': ['sopecne', 'Havaj, Island, Lanzarote'], 'Lávové jezero': ['sopecne', 'Nyiragongo, Erta Ale, Kīlauea'],
    'Pliniovská erupce': ['sopecne', 'Vesuv roku 79, Pinatubo 1991'], 'Strombolská erupce': ['sopecne', 'Etna, Paricutín'],
    'Freatická erupce': ['sopecne', 'Ontake 2014, Whakaari 2019'], 'Sopečný popel': ['sopecne', 'Eyjafjallajökull 2010, Pinatubo 1991'],
    'Lapilli': ['sopecne', 'svahy Vesuvu a Etny, Kanárské ostrovy'], 'Termální pramen': ['sopecne', 'Island, Yellowstone, Karlovy Vary'],
    'Sloupcová odlučnost': ['magmaticke', 'Panská skála u Kamenického Šenova, Severní Irsko'],
    'Fulgurit': ['jevy', 'písečné pouště a pláže zasažené bleskem'], 'Bahnotok': ['jevy', 'horské svahy po přívalových deštích'],
    // další krasové útvary a jeskyně
    'Cenote': ['krasove', 'poloostrov Yucatán v Mexiku'], 'Mogot': ['krasove', 'Viñales na Kubě, Kuej-lin v Číně'],
    'Ponor (propadání vodního toku)': ['krasove', 'Sloupský potok v Moravském krasu'], 'Ponorná řeka': ['krasove', 'Punkva v Moravském krasu, Reka ve Slovinsku'],
    'Uvala': ['krasove', 'Dinárský kras, Moravský kras'], 'Estavela': ['krasove', 'Dinárský kras ve Slovinsku a Chorvatsku'],
    'Brčko (geologie)': ['krasove', 'jeskyně Moravského krasu'], 'Jeskynní perla': ['krasove', 'jeskyně Moravského krasu, Postojna'],
    'Krápníková jeskyně': ['krasove', 'Moravský kras, Český kras, Postojna'], 'Příbojová jeskyně': ['vodni', 'Capri v Itálii, ostrov Staffa ve Skotsku'],
    // ledovce a mrazové jevy
    'Ledovec': ['ledovcove', 'Aletsch v Alpách, Vatnajökull na Islandu, Grónsko'], 'Šelfový ledovec': ['ledovcove', 'Rossův a Filchnerův v Antarktidě'],
    'Ledopád': ['ledovcove', 'Khumbu pod Everestem, Alpy'], 'Firn': ['ledovcove', 'horní části ledovců v Alpách a Himálaji'],
    'Areta (geologie)': ['ledovcove', 'Alpy, Vysoké Tatry'], 'Horský štít': ['ledovcove', 'Matterhorn ve Švýcarsku'],
    'Oblík (geologie)': ['ledovcove', 'Skandinávie, Kanada, Alpy'], 'Sandr': ['ledovcove', 'jižní Island, severní Německo'],
    'Visuté údolí': ['ledovcove', 'Lauterbrunnen ve Švýcarsku, Yosemite v USA'], 'Kamenné moře': ['ledovcove', 'Šumava, Jizerské hory, Krkonoše'],
    // řeky a pobřeží
    'Vodopád': ['vodni', 'Niagara, Iguaçu, Salto Ángel'], 'Kosa (geomorfologie)': ['vodni', 'poloostrov Hel, Arabatská strelka na Krymu'],
    'Rokle': ['vodni', 'pískovcové skály Českého ráje'], 'Terasa (geologie)': ['vodni', 'Vltava v Praze, Labe, Morava'],
    'Obří hrnce': ['vodni', 'Mumlava v Krkonoších, Jizera'], 'Klif': ['vodni', 'Bílé útesy u Doveru, Étretat v Normandii'],
    // poušť, skály a svahy
    'Badlands': ['pousteni', 'Jižní Dakota v USA, Bardenas Reales ve Španělsku'], 'Solná pláň': ['pousteni', 'Salar de Uyuni v Bolívii, Bonneville v Utahu'],
    'Svědecká hora': ['horske', 'Monument Valley v USA'], 'Stolová hora': ['horske', 'Kapské Město, Roraima ve Venezuele, Děčínský Sněžník'],
    'Voština (geomorfologický jev)': ['pousteni', 'pískovce Českého ráje a Labských pískovců'], 'Tor (skalní tvar)': ['horske', 'Dartmoor v Anglii, Šumava, Krkonoše'],
    'Náhorní plošina': ['horske', 'Tibet, Altiplano v Andách'], 'Kuesta': ['horske', 'Niagarská v Kanadě, Cotswolds v Anglii'],
    'Suť (přírodní)': ['horske', 'Alpy, Vysoké Tatry, Krkonoše'], 'Kuloár': ['horske', 'Alpy, Vysoké Tatry, Krkonoše'],
    // tektonika
    'Hrásť': ['tektonicke', 'Harz, Vogézy, Schwarzwald'], 'Parovina': ['tektonicke', 'Českomoravská vrchovina, Kanadský štít']
};
// Slavná geologická místa: název článku → [skupina, kde to je, jméno v tématu (jinak název článku), další psané odpovědi]
export const NAMED_SITES = {
    "Giant's Causeway": ['magmaticke', 'Severní Irsko', 'Obrův chodník', ["Giant's Causeway"]], 'Devils Tower': ['magmaticke', 'Wyoming v USA', undefined, ['Ďáblova věž']],
    'Panská skála': ['magmaticke', 'Kamenický Šenov na Děčínsku'], 'Železná hůrka': ['sopecne', 'Chebsko'], 'Komorní hůrka': ['sopecne', 'Chebsko u Františkových Lázní'],
    'Geysir': ['sopecne', 'údolí Haukadalur na Islandu'], 'Strokkur': ['sopecne', 'údolí Haukadalur na Islandu'], 'Old Faithful': ['sopecne', 'Yellowstonský národní park v USA'],
    'Vřídlo (Karlovy Vary)': ['sopecne', 'Karlovy Vary'], 'Pamukkale': ['krasove', 'jihozápadní Turecko'], 'Hranická propast': ['krasove', 'Moravská brána u Teplic nad Bečvou'],
    'Punkevní jeskyně': ['krasove', 'Moravský kras'], 'Koněpruské jeskyně': ['krasove', 'Český kras u Berouna'],
    'Kappadokie': ['pousteni', 'střední Turecko'], 'Antilopí kaňon': ['pousteni', 'Arizona v USA'], 'Pravčická brána': ['pousteni', 'České Švýcarsko u Hřenska'],
    'Chicxulubský kráter': ['impaktni', 'poloostrov Yucatán v Mexiku'], 'Rieský kráter': ['impaktni', 'Bavorsko v Německu'],
    'Meteor Crater': ['impaktni', 'Arizona v USA', undefined, ['Barringerův kráter']], 'Vredefort (kráter)': ['impaktni', 'Jihoafrická republika'],
    'Sudbury Basin': ['impaktni', 'Ontario v Kanadě'], 'Popigajský kráter': ['impaktni', 'Sibiř v Rusku'], 'Manicouagan': ['impaktni', 'Québec v Kanadě'],
    'Bosumtwi': ['impaktni', 'Ghana'], 'Tunguská událost': ['impaktni', 'Sibiř, 30. června 1908'], 'Čeljabinský meteor': ['impaktni', 'jižní Ural v Rusku, únor 2013'],
    'Meteorit Hoba': ['impaktni', 'Namibie'], 'ALH 84001': ['impaktni', 'nalezen v Antarktidě, pochází z Marsu'],
    'Murchisonský meteorit': ['impaktni', 'Victoria v Austrálii, 1969'], 'Příbram (meteorit)': ['impaktni', 'Brdy ve středních Čechách, duben 1959', 'Meteorit Příbram'],
    'Burgesské břidlice': ['naleziste', 'Britská Kolumbie v Kanadě'], 'Messelský důl': ['naleziste', 'Hesensko v Německu'], 'Barrandien': ['naleziste', 'mezi Prahou a Plzní']
};
// Útvary, zkameněliny a diamanty, které mají ve Wikidatech jen kresbu nebo schéma: skutečná fotka z Commons (volná licence)
export const PHOTO_OVERRIDES = {
    'Kaldera': 'Crater Lake - Flickr - Simaron.jpg', 'Štítová sopka': 'Mauna Loa Volcano.jpg', 'Esker': 'Esker in Rocknen Naturreservat.jpg',
    'Rift': 'Almannagjá rift at Þingvellir National Park.jpg', 'Pliniovská erupce': 'Pinatubo91eruption plume.jpg',
    'Strombolská erupce': 'Strombolian eruption - Mount Etna Volcano (8536060815).jpg', 'Kuesta': 'Cuesta landscape on the road from Wukro to Hauzien.jpg',
    'Firn': 'Firn ss 2006.jpg', 'Anomalocaris': 'Anomalocaris canadensis fossil.jpg', 'Opabinia': 'USNM PAL 57683 Opabinia regalis Image 3.jpg',
    'Dickinsonia': 'Dickinsonia - Ediacaran Fossil from Flinders Range in South Australia.jpg', 'Charnia': 'Charnia masoni fossil, New Walk Museum.jpg',
    'Spriggina': 'Big Spriggina floundersi.jpg', 'Cooksonia': 'Cooksonia barrandei (National Museum in Prague).jpg', 'Pikaia': 'USNM PAL 57628 Pikaia gracilens.jpg',
    'Koh-i-Noor': 'Replica of the Koh-i-Noor.jpg'
};
// Slavná místa v Česku (česká stopa)
export const CZECH_SITES = new Set(['Panská skála', 'Železná hůrka', 'Komorní hůrka', 'Vřídlo (Karlovy Vary)', 'Hranická propast', 'Punkevní jeskyně',
    'Koněpruské jeskyně', 'Pravčická brána', 'Příbram (meteorit)', 'Barrandien']);
// Slavné broušené diamanty: název článku → [jméno, hmotnost v karátech, barva, kde byl nalezen, kde je dnes]
export const FAMOUS_DIAMONDS = {
    'Koh-i-Noor': ['Koh-i-Noor', 105.6, 'bezbarvý', 'Indie', 'britské korunovační klenoty v londýnském Toweru'],
    'Cullinan': ['Cullinan', 3106, 'bezbarvý', 'Jihoafrická republika (1905)', 'rozbroušen; největší kusy zdobí britské korunovační klenoty'],
    'Hope (diamant)': ['Hope', 45.52, 'tmavě modrý', 'Indie', 'Smithsonův institut ve Washingtonu'],
    'Orlov (diamant)': ['Orlov', 189.6, 'bezbarvý s modrozeleným nádechem', 'Indie', 'carské žezlo v Diamantovém fondu v Moskvě'],
    'Darya-i-Noor': ['Darya-i-Noor', 182, 'světle růžový', 'Indie', 'íránské korunovační klenoty v Teheránu']
};
export const FORM_GROUPS = {
    sopecne: 'vulkanismus', ledovcove: 'zalednění a mrazové jevy', vodni: 'řeky a pobřeží', pousteni: 'poušť a zvětrávání', krasove: 'krasové jevy',
    tektonicke: 'tektonika a stavba Země', magmaticke: 'horninová tělesa a útvary', impaktni: 'dopady z vesmíru', jevy: 'přírodní jevy',
    horske: 'skály, svahy a vrcholy', naleziste: 'naleziště zkamenělin'
};
// Útvary a jevy, které zná i neodborník
export const KNOWN_FORMS = new Set(['Gejzír', 'Fjord', 'Kaňon', 'Duna', 'Kaldera', 'Sopečný kráter', 'Stalaktit', 'Stalagmit', 'Zemětřesení', 'Tsunami', 'Impaktní kráter',
    'Moréna', 'Meteorit', 'Korálový útes', 'Říční delta', 'Laguna', 'Zlom', 'Permafrost', 'Atol', 'Meandr', 'Stratovulkán', 'Subdukce',
    'Vodopád', 'Ledovec', 'Náhorní plošina', 'Stolová hora', 'Sopečný popel', 'Termální pramen', 'Rokle', 'Sopečné jezero', 'Podmořská sopka',
    "Giant's Causeway", 'Chicxulubský kráter', 'Tunguská událost', 'Pravčická brána', 'Punkevní jeskyně', 'Pamukkale', 'Kappadokie', 'Geysir', 'Old Faithful',
    'Meteor Crater', 'Čeljabinský meteor', 'Vřídlo (Karlovy Vary)', 'Barrandien']);

// --- Zkameněliny a vyhynulé organismy bez obratlovců (ty jsou v tématu Biologie): název článku → [skupina, doba, zajímavost] ---
export const FOSSILS = {
    'Trilobiti': ['členovci', 'kambrium až perm', 'nejznámější vedoucí zkamenělina prvohor, tělo se třemi laloky'],
    'Amoniti': ['hlavonožci', 'devon až konec křídy', 'spirálně stočené schránky; vedoucí zkameněliny druhohor'],
    'Belemniti': ['hlavonožci', 'jura a křída', 'zkamenělé vnitřní kostry podobné střelám („čertovy prsty“)'],
    'Graptoliti': ['polostrunatci', 'kambrium až karbon', 'kolonie v podobě pilkovitých stébel; vedoucí zkameněliny siluru'],
    'Kyjonožci': ['členovci', 'ordovik až perm', 'obří „mořští škorpioni“ až dvoumetrové délky'],
    'Ramenonožci': ['bezobratlí s dvouchlopňovou schránkou', 'kambrium až dodnes', 'dvouchlopňové schránky, nejhojnější zkameněliny prvohor'],
    'Lilijice': ['ostnokožci', 'ordovik až dodnes', 'články stonků tvoří „kolečka“ ve vápencích'],
    'Koprolit': ['stopy a ostatky', 'všechny doby', 'zkamenělý trus'],
    'Zkamenělé dřevo': ['stopy a ostatky', 'od devonu', 'strom proměněný křemenem'],
    'Stromatolit': ['stopy a ostatky', 'od archaika dodnes', 'vrstevnaté útvary vytvořené sinicemi; nejstarší stopy života'],
    'Lepidodendron': ['rostliny', 'karbon', 'stromovitá plavuň až 30 m vysoká; hlavní tvůrce černého uhlí'],
    'Archaeopteris': ['rostliny', 'devon', 'jeden z prvních stromů s pravými listy a kmenem'],
    'Kordaity': ['rostliny', 'karbon až perm', 'vysoké stromy s pásovými listy, předchůdci jehličnanů'],
    'Stromatopory': ['houby', 'ordovik až devon', 'vápnité kolonie, tvůrci devonských útesů'],
    'Anomalocaris': ['členovci', 'kambrium', 'největší predátor kambrických moří, až metr dlouhý'],
    'Hallucigenia': ['zvláštní bezobratlí', 'kambrium', 'červovité tělo s hřbetními bodlinami'],
    'Opabinia': ['zvláštní bezobratlí', 'kambrium', 'pět očí a chobot s klepetem'],
    'Wiwaxia': ['zvláštní bezobratlí', 'kambrium', 'tělo pokryté šupinami a bodlinami'],
    'Dickinsonia': ['záhadné organismy', 'ediakara', 'plochý oválný organismus s žebrováním'],
    'Charnia': ['záhadné organismy', 'ediakara', 'přisedlý organismus podobný peří'],
    'Spriggina': ['záhadné organismy', 'ediakara', 'segmentované tělo s „hlavovým štítem“'],
    'Meganeura': ['členovci', 'karbon', 'obří vážkovitý hmyz s rozpětím křídel až 70 cm'],
    'Arthropleura': ['členovci', 'karbon', 'největší suchozemský bezobratlý, až 2,5 m dlouhý'],
    'Pterygotus': ['členovci', 'silur až devon', 'kyjonožec s velkými klepety, až 1,6 m dlouhý'],
    'Jaekelopterus': ['členovci', 'devon', 'největší známý členovec, až 2,5 m dlouhý'],
    'Cooksonia': ['rostliny', 'silur až devon', 'jedna z nejstarších cévnatých rostlin, jen pár centimetrů vysoká'],
    'Prototaxites': ['houby', 'silur až devon', 'až osmimetrový „sloup“ z hub a lišejníků'],
    'Aegirocassis': ['členovci', 'ordovik', 'obří filtrující předchůdce korýšů'],
    'Yunnanozoon': ['raní strunatci', 'kambrium', 'raný příbuzný strunatců z čínské Čcheng-ťiangu'],
    'Cameroceras': ['hlavonožci', 'ordovik', 'rovná schránka dlouhá až 6 m'],
    'Pulmonoscorpius': ['členovci', 'karbon', 'obří štír dlouhý až 70 cm'],
    'Schinderhannes bartelsi': ['členovci', 'devon', 'příbuzný anomalocarise z německých břidlic Hunsrück'],
    'Benetity': ['rostliny', 'trias až křída', 'druhohorní rostliny podobné cykasům'],
    'Kapraďosemenné': ['rostliny', 'devon až křída', 'kapradinovité listy, ale rozmnožování semeny'],
    'Calamitales': ['rostliny', 'karbon až perm', 'stromovité přesličky až 20 m vysoké, tvůrci uhelných slojí'],
    'Pikaia': ['raní strunatci', 'kambrium', 'drobný živočich s chordou, jeden z prvních příbuzných obratlovců'],
    'Haikouella': ['raní strunatci', 'kambrium', 'raný strunatec z čínského naleziště Čcheng-ťiang'],
    'Ottoia': ['zvláštní bezobratlí', 'kambrium', 'dravý červ z Burgesských břidlic, příbuzný dnešních hlavatců'],
    'Tullimonstrum': ['zvláštní bezobratlí', 'karbon', 'záhadný živočich s chobotem a očima na příčné tyčce, nalezený v Illinois'],
    'Ceratites': ['hlavonožci', 'trias', 'hlavonožec se zvlněnými švy na schránce, vedoucí zkamenělina středního triasu'],
    'Deiphon': ['členovci', 'silur', 'drobný trilobit s kulovitou hlavou a dlouhými trny, i z Barrandienu'],
    'Gastrolit': ['stopy a ostatky', 'všechny doby', 'oblázky, které živočichové spolykali kvůli trávení']
};
export const KNOWN_FOSSILS = new Set(['Trilobiti', 'Amoniti', 'Belemniti', 'Stromatolit', 'Zkamenělé dřevo', 'Lepidodendron', 'Anomalocaris', 'Graptoliti', 'Pikaia']);

// --- Další horniny: název → [skupina, složení, vzhled a vznik]; sporná skupina = bez otázky na skupinu ---
export const MORE_ROCKS = {
    'Břidlice': ['sporna', 'jílové minerály, slídy', 'tence vrstevnatá, dobře se štípe na desky'],
    'Tuf': ['sporna', 'zpevněný sopečný popel', 'lehká a pórovitá, vzniká ze sopečného popela'],
    'Ignimbrit': ['sporna', 'zpevněný sopečný popel a pemza', 'vzniká usazením a svařením horkého pyroklastického proudu'],
    'Kimberlit': ['sporna', 'olivín, pyrop, slídy', 'modravě zelená hornina sopečných komínů, nosič diamantů'],
    'Porfyr': ['zilna', 'vyrostlice živců ve sklovité až jemnozrnné základní hmotě', 'vyrostlice větších krystalů v jemnozrnné hornině'],
    'Karbonatit': ['sporna', 'kalcit nebo dolomit', 'vzácná hornina vyvřelého původu z uhličitanů'],
    'Norit': ['hlubinna', 'plagioklas, ortopyroxen', 'tmavá, hrubě zrnitá'],
    'Hornblendit': ['hlubinna', 'amfibol', 'tmavá, hrubě zrnitá'],
    'Tefrit': ['vylevna', 'plagioklas, pyroxen, foidy', 'tmavá, jemnozrnná'],
    'Pikrit': ['vylevna', 'olivín, pyroxen', 'tmavá, olivínem bohatá'],
    'Latit': ['vylevna', 'plagioklas, draselný živec', 'šedá až narůžovělá, jemnozrnná s vyrostlicemi'],
    'Spraš': ['usazena', 'jemný prach křemene a kalcitu', 'žlutohnědý větrem naváty prach z dob ledových'],
    'Evaporit': ['usazena', 'sůl kamenná, sádrovec, sylvín', 'vzniká odpařením mořské nebo jezerní vody'],
    'Jíl': ['usazena', 'jílové minerály', 'jemnozrnný, ve vodě plastický'],
    'Štěrk': ['usazena', 'zaoblená zrna o velikosti 2 až 63 mm', 'nezpevněné říční nebo mořské valouny'],
    'Modrá břidlice': ['premenena', 'glaukofán, lawsonit', 'modrošedá; vzniká při subdukci za vysokého tlaku'],
    'Fosforit': ['usazena', 'fosforečnany vápníku', 'vzniká v mořích, surovina na hnojiva'],
    'Písek': ['usazena', 'zrna křemene a dalších nerostů velká 0,063 až 2 mm', 'nezpevněná usazenina řek, moří a pouští'],
    'Rašelina': ['usazena', 'částečně rozložené zbytky rostlin, hlavně rašeliníku', 'nejmladší stupeň zuhelnatění, vzniká v rašeliništích'],
    'Ropné břidlice': ['usazena', 'jílovitá hornina s organickou hmotou (kerogenem)', 'tmavá vrstevnatá hornina, ze které se zahříváním získává ropa'],
    'Ropné písky': ['usazena', 'písek nasycený těžkou ropou (bitumenem)', 'černé lepkavé písky z mělkých ložisek'],
    'Bentonit': ['usazena', 'montmorillonit a další jílové minerály', 'jíl ze zvětralého sopečného popela, ve vodě silně bobtná'],
    'Kaolin': ['usazena', 'kaolinit, křemen, slídy', 'bílá jílovitá hornina ze zvětralé žuly a ruly'],
    'Flyš': ['usazena', 'střídající se pískovce, jílovce a slepence', 'rytmicky vrstevnaté souvrství z podmořských proudů'],
    'Páskovaná železná ruda': ['usazena', 'hematit, magnetit a jaspis', 'pruhy železa a křemene z prahor a starohor'],
    'Pizolit': ['usazena', 'kuličky kalcitu nebo aragonitu', 'drobné kuličky vysrážené v teplých pramenech'],
    'Sintr': ['usazena', 'opál nebo kalcit vysrážený z horké vody', 'vrstevnatá hornina kolem gejzírů a horkých pramenů'],
    'Komatiit': ['vylevna', 'olivín, pyroxen', 'ultrabazická láva z prahor s jehlicovitými krystaly olivínu'],
    'Boninit': ['vylevna', 'pyroxen, olivín, sopečné sklo', 'tmavá, sklovitá láva z ostrovních oblouků'],
    'Nefelinit': ['vylevna', 'nefelín, pyroxen', 'tmavá výlevná hornina bez živců'],
    'Larvikit': ['hlubinna', 'alkalické živce s modrým leskem, pyroxen', 'tmavá, s modře se třpytícími živci'],
    'Trondhjemit': ['hlubinna', 'plagioklas, křemen, biotit', 'světlá, zrnitá, chudá na tmavé nerosty'],
    'Smirek': ['premenena', 'korund, magnetit, hematit', 'tvrdá tmavá zrnitá hornina'],
    'Pucolán': ['sporna', 'sopečný popel a tuf bohatý na oxid křemičitý', 'sypký sopečný materiál z okolí Neapole'],
    'Šungit': ['sporna', 'uhlík s křemenem', 'černá lesklá hornina z prahor Karélie'],
    'Spilit': ['sporna', 'albit, chlorit, pyroxen', 'přeměněný podmořský čedič, často polštářová láva'],
    'Felsit': ['sporna', 'jemnozrnný křemen a živce', 'světlá, velmi jemnozrnná vyvřelina'],
    'Suevit': ['sporna', 'úlomky hornin a skla roztaveného dopadem', 'brekcie z impaktního kráteru'],
    'Unakit': ['sporna', 'epidot, růžový živec, křemen', 'zelenorůžová skvrnitá přeměněná žula']
};
// Horniny, které se podle štítku najdou špatně nebo vůbec (písek je i město, ropné břidlice mají štítek v jednotném čísle)
export const MORE_ROCK_QIDS = {
    'písek': 'Q34679', 'rašelina': 'Q184624', 'ropné břidlice': 'Q221378', 'ropné písky': 'Q297322', 'bentonit': 'Q380149', 'kaolin': 'Q908663',
    'flyš': 'Q756914', 'páskovaná železná ruda': 'Q304213', 'pizolit': 'Q1760214', 'sintr': 'Q11770779', 'komatiit': 'Q664329', 'boninit': 'Q892591',
    'nefelinit': 'Q1344173', 'larvikit': 'Q1397061', 'trondhjemit': 'Q648825', 'smirek': 'Q1136648', 'pucolán': 'Q694124', 'šungit': 'Q906641',
    'spilit': 'Q1274602', 'felsit': 'Q2662981', 'suevit': 'Q447600', 'unakit': 'Q656325'
};

// --- Další období a věky: [název článku, název, úroveň, nadřazená jednotka, od, do (mil. let; ICS v2026/06), život] ---
export const MORE_PERIODS = [
    ['Paleocén', 'Paleocén', 'epocha', 'Paleogén', 66, 56, 'první velcí savci a ptáci po vymření dinosaurů'],
    ['Eocén', 'Eocén', 'epocha', 'Paleogén', 56, 33.9, 'první kopytníci, velryby a primáti; tropické lesy i v Evropě'],
    ['Oligocén', 'Oligocén', 'epocha', 'Paleogén', 33.9, 23.04, 'ochlazení, ustupují lesy a rozšiřují se trávy'],
    ['Miocén', 'Miocén', 'epocha', 'Neogén', 23.04, 5.333, 'travnaté stepi, lidoopi; vznik Alp a Himálaje'],
    ['Pliocén', 'Pliocén', 'epocha', 'Neogén', 5.333, 2.58, 'australopitékové, první předkové člověka'],
    ['Ediakara', 'Ediakara', 'perioda', 'Proterozoikum', 635, 538.8, 'první velcí mnohobuněční živočichové (dickinsonie)'],
    ['Kryogén', 'Kryogén', 'perioda', 'Proterozoikum', 720, 635, 'globální zalednění, „Země jako sněhová koule“'],
    ['Fanerozoikum', 'Fanerozoikum', 'eon', undefined, 538.8, 0, 'od trilobitů přes dinosaury po člověka: doba bohatého života'],
    ['Berrias', 'Berrias', 'věk', 'Křída', 143.1, 137.05], ['Valangin', 'Valangin', 'věk', 'Křída', 137.05, 132.6], ['Hauteriv', 'Hauteriv', 'věk', 'Křída', 132.6, 125.77],
    ['Barrem', 'Barrem', 'věk', 'Křída', 125.77, 121.4], ['Alb', 'Alb', 'věk', 'Křída', 113.2, 100.5], ['Cenoman', 'Cenoman', 'věk', 'Křída', 100.5, 93.9],
    ['Turon', 'Turon', 'věk', 'Křída', 93.9, 89.8], ['Santon', 'Santon', 'věk', 'Křída', 85.7, 83.6], ['Kampán', 'Kampán', 'věk', 'Křída', 83.6, 72.2],
    ['Hettang', 'Hettang', 'věk', 'Jura', 201.4, 199.5], ['Sinemur', 'Sinemur', 'věk', 'Jura', 199.5, 192.9], ['Pliensbach', 'Pliensbach', 'věk', 'Jura', 192.9, 184.2],
    ['Toark', 'Toark', 'věk', 'Jura', 184.2, 174.7], ['Aalen (geologie)', 'Aalen', 'věk', 'Jura', 174.7, 170.9], ['Bajok', 'Bajok', 'věk', 'Jura', 170.9, 168.2],
    ['Kimmeridge', 'Kimmeridge', 'věk', 'Jura', 154.8, 149.2], ['Tithon', 'Tithon', 'věk', 'Jura', 149.2, 143.1],
    ['Karn', 'Karn', 'věk', 'Trias', 237, 227.3], ['Nor (stratigrafická jednotka)', 'Nor', 'věk', 'Trias', 227.3, 205.7],
    // Hranice z téže tabulky (Rét končí začátkem jury, Apt sedí mezi barremem a albem, Dan končí začátkem selandu 61,6)
    ['Rét', 'Rét', 'věk', 'Trias', 205.7, 201.4], ['Apt (geologie)', 'Apt', 'věk', 'Křída', 121.4, 113.2],
    ['Dan (geologie)', 'Dan', 'věk', 'Paleogén', 66, 61.6, 'první savci a ptáci po vymření dinosaurů'],
    ['Spodní křída', 'Spodní křída', 'epocha', 'Křída', 143.1, 100.5, 'první kvetoucí rostliny, velcí býložraví dinosauři'],
    ['Svrchní křída', 'Svrchní křída', 'epocha', 'Křída', 100.5, 66, 'tyranosaurus a triceratops; na konci vymření dinosaurů'],
    ['Cisural', 'Cisural', 'epocha', 'Perm', 298.9, 273.01, 'savcovití plazi, rozsáhlé pouště superkontinentu Pangea'],
    ['Kenozoikum', 'Kenozoikum', 'éra', undefined, 66, 0, 'věk savců: od vymření dinosaurů po dnešek'],
    ['Prekambrium', 'Prekambrium', 'superéon', undefined, 4567, 538.8, 'od vzniku Země po první velké mnohobuněčné živočichy'],
    ['Neoproterozoikum', 'Neoproterozoikum', 'éra', 'Proterozoikum', 1000, 538.8, 'globální zalednění a první mnohobuněční živočichové'],
    ['Eoarchaikum', 'Eoarchaikum', 'éra', 'Archaikum', 4031, 3600, 'nejstarší zachované horniny a první stopy života']
];

// Dvojice, které by na fotce nebo podle popisu mohly být obě správně (meteorit × chondrit, tuf × ignimbrit); nesejdou se mezi možnostmi
export const MORE_CONFLICTS = [
    ['Stalaktit', 'Stalagmit'], ['Stalaktit', 'Stalagnát'], ['Stalagmit', 'Stalagnát'], ['Meteorit', 'Chondrit'], ['Meteorit', 'Pallasit'], ['Chondrit', 'Pallasit'],
    ['Tektit', 'Impaktit'], ['Sopečný kráter', 'Maar'], ['Gejzír', 'Fumarola'], ['Pingo', 'Permafrost'], ['Fjord', 'Ledovcové údolí'], ['Údolní niva', 'Mrtvé rameno'],
    ['Kaňon', 'Soutěska'], ['Meandr', 'Mrtvé rameno'], ['Říční delta', 'Estuár'], ['Kar', 'Ledovcové údolí'], ['Sopečný dóm', 'Stratovulkán'], ['Lakolit', 'Batolit'],
    ['Kyjonožci', 'Pterygotus'], ['Kyjonožci', 'Jaekelopterus'], ['Pterygotus', 'Jaekelopterus'], ['Lepidodendron', 'Kapraďosemenné'],
    ['Tuf', 'Ignimbrit'], ['Břidlice', 'Modrá břidlice'], ['Břidlice', 'Jíl'], ['Norit', 'Gabro'], ['Porfyr', 'Latit'], ['Pikrit', 'Čedič'], ['Tefrit', 'Čedič'],
    ['Hornblendit', 'Amfibolit'], ['Štěrk', 'Slepenec'], ['Zkamenělé dřevo', 'Lepidodendron'],
    // nové útvary, horniny, zkameněliny a období
    ['Podmořská sopka', 'Guyot'], ['Sopečné jezero', 'Maar'], ['Sopečné jezero', 'Kaldera'], ['Lávový tunel', 'Lávový proud'], ['Lávové jezero', 'Lávový proud'],
    ['Pliniovská erupce', 'Strombolská erupce'], ['Pliniovská erupce', 'Freatická erupce'], ['Strombolská erupce', 'Freatická erupce'], ['Sopečný popel', 'Lapilli'],
    ['Termální pramen', 'Gejzír'], ['Termální pramen', 'Vyvěračka'], ['Bahnotok', 'Lahar'], ['Sloupcová odlučnost', 'Obrův chodník'], ['Sloupcová odlučnost', 'Panská skála'],
    ['Sloupcová odlučnost', 'Devils Tower'], ['Obrův chodník', 'Panská skála'], ['Ponor', 'Ponorná řeka'], ['Ponor', 'Estavela'], ['Estavela', 'Vyvěračka'],
    ['Uvala', 'Závrt'], ['Uvala', 'Polje'], ['Brčko', 'Stalaktit'], ['Jeskynní perla', 'Stalagmit'], ['Krápníková jeskyně', 'Punkevní jeskyně'],
    ['Krápníková jeskyně', 'Koněpruské jeskyně'], ['Ledovec', 'Šelfový ledovec'], ['Ledovec', 'Ledopád'], ['Ledovec', 'Firn'], ['Ledopád', 'Serak'],
    ['Areta', 'Horský štít'], ['Areta', 'Kar'], ['Oblík', 'Bludný balvan'], ['Sandr', 'Moréna'], ['Visuté údolí', 'Ledovcové údolí'], ['Kamenné moře', 'Suť'],
    ['Vodopád', 'Obří hrnce'], ['Kosa', 'Tombolo'], ['Rokle', 'Soutěska'], ['Rokle', 'Kaňon'], ['Terasa', 'Údolní niva'], ['Klif', 'Příbojová jeskyně'],
    ['Badlands', 'Kaňon'], ['Solná pláň', 'Playa'], ['Svědecká hora', 'Stolová hora'], ['Tor', 'Skalní hřib'], ['Náhorní plošina', 'Stolová hora'], ['Kuesta', 'Hřbet'],
    ['Kuloár', 'Rokle'], ['Hrásť', 'Příkop'], ['Parovina', 'Náhorní plošina'], ['Pravčická brána', 'Skalní brána'], ['Antilopí kaňon', 'Soutěska'], ['Antilopí kaňon', 'Kaňon'],
    ['Geysir', 'Strokkur'], ['Geysir', 'Gejzír'], ['Strokkur', 'Gejzír'], ['Old Faithful', 'Gejzír'], ['Vřídlo', 'Gejzír'], ['Vřídlo', 'Termální pramen'], ['Pamukkale', 'Travertin'],
    ['Hranická propast', 'Závrt'], ['Punkevní jeskyně', 'Koněpruské jeskyně'], ['Chicxulubský kráter', 'Impaktní kráter'], ['Rieský kráter', 'Impaktní kráter'],
    ['Meteor Crater', 'Impaktní kráter'], ['Vredefort', 'Impaktní kráter'], ['Sudbury Basin', 'Impaktní kráter'], ['Popigajský kráter', 'Impaktní kráter'],
    ['Manicouagan', 'Impaktní kráter'], ['Bosumtwi', 'Impaktní kráter'], ['Meteorit Hoba', 'Meteorit'], ['ALH 84001', 'Meteorit'], ['Murchisonský meteorit', 'Meteorit'],
    ['Murchisonský meteorit', 'Chondrit'], ['Meteorit Příbram', 'Meteorit'], ['Tunguská událost', 'Čeljabinský meteor'], ['Komorní hůrka', 'Železná hůrka'],
    ['Písek', 'Pískovec'], ['Písek', 'Štěrk'], ['Ropné písky', 'Písek'], ['Ropné břidlice', 'Břidlice'], ['Ropné písky', 'Ropné břidlice'], ['Rašelina', 'Hnědé uhlí'],
    ['Bentonit', 'Jíl'], ['Kaolin', 'Jíl'], ['Kaolin', 'Kaolinit'], ['Bentonit', 'Montmorillonit'], ['Flyš', 'Pískovec'], ['Pizolit', 'Travertin'], ['Sintr', 'Travertin'],
    ['Sintr', 'Pěnovec'], ['Komatiit', 'Peridotit'], ['Boninit', 'Andezit'], ['Nefelinit', 'Bazanit'], ['Nefelinit', 'Tefrit'], ['Larvikit', 'Syenit'], ['Larvikit', 'Labradorit'],
    ['Trondhjemit', 'Tonalit'], ['Smirek', 'Korund'], ['Pucolán', 'Tuf'], ['Pucolán', 'Sopečný popel'], ['Šungit', 'Antracit'], ['Spilit', 'Čedič'], ['Felsit', 'Ryolit'],
    ['Suevit', 'Impaktit'], ['Suevit', 'Brekcie'], ['Unakit', 'Epidot'], ['Ceratites', 'Amoniti'], ['Deiphon', 'Trilobiti'], ['Pikaia', 'Haikouella'], ['Haikouella', 'Yunnanozoon'],
    ['Ottoia', 'Hallucigenia'], ['Gastrolit', 'Koprolit'], ['Kenozoikum', 'Třetihory'], ['Kenozoikum', 'Čtvrtohory'], ['Kenozoikum', 'Paleogén'],
    ['Kenozoikum', 'Neogén'], ['Kenozoikum', 'Fanerozoikum'], ['Prekambrium', 'Hadaikum'], ['Prekambrium', 'Archaikum'], ['Prekambrium', 'Proterozoikum'],
    ['Prekambrium', 'Ediakara'], ['Prekambrium', 'Kryogén'], ['Prekambrium', 'Neoproterozoikum'], ['Prekambrium', 'Eoarchaikum'], ['Neoproterozoikum', 'Ediakara'],
    ['Neoproterozoikum', 'Kryogén'], ['Spodní křída', 'Svrchní křída'], ['Dan', 'Paleocén'], ['Cisural', 'Perm']
];
